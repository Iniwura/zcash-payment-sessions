use std::{
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use anyhow::{Context, Result, anyhow, bail, ensure};
use async_trait::async_trait;
use bip0039::{English, Mnemonic};
use rand::{rand_core::UnwrapErr, rngs::SysRng};
use secrecy::SecretVec;
use zcash_client_backend::{
    data_api::{
        Account as AccountTrait, AccountBirthday, WalletRead, WalletWrite,
        chain::{BlockCache, BlockSource, error::Error as ChainError},
        wallet::{
            ConfirmationsPolicy,
            input_selection::{
                GreedyInputSelector, SpendPolicy, TransparentSpendPolicy,
            },
            propose_transfer, create_proposed_transactions,
        },
    },
    wallet::OvkPolicy,
    fees::{DustOutputPolicy, StandardFeeRule, zip317::SingleOutputChangeStrategy},
    proto::{
        compact_formats::CompactBlock,
        service::{
            self, BlockId, Empty, GetAddressUtxosArg, RawTransaction,
            compact_tx_streamer_client::CompactTxStreamerClient,
        },
    },
};
use zcash_client_sqlite::{
    WalletDb,
    util::SystemClock,
    wallet::init::init_wallet_db,
};
use zcash_keys::{
    address::Address,
    encoding::{AddressCodec, encode_payment_address_p},
    keys::{UnifiedAddressRequest, UnifiedFullViewingKey, UnifiedSpendingKey},
};
use zcash_primitives::{
    transaction::{Transaction, TxId},
};
use zcash_protocol::{
    ShieldedPool,
    consensus::{BlockHeight, BranchId, Network},
    value::Zatoshis,
};
use zcash_transparent::address::TransparentAddress;
use zip321::TransactionRequest;

const LIBRUSTZCASH_REV: &str = "3c76c2d822446a68b67cd25692aaf92b4f6cb98c";
const DEFAULT_LIGHTWALLETD: &str = "https://zcash-testnet.chainsafe.dev";
const DEFAULT_SENDER_MNEMONIC: &str = "testnet-sender/mnemonic.txt";
const DEFAULT_RECIPIENT_SEED: &str = "testnet-seed.bin";
const DEFAULT_BIRTHDAY: u32 = 4_481_047;
const DEFAULT_FUNDING_TXID: &str = "44c830bedba15d186ca515611b3f09ad9d1f026ffeb2a209666a2cdbaac79571";
const DEFAULT_FUNDING_HEIGHT: u32 = 4_481_765;
const DEFAULT_FUNDING_VALUE: u64 = 10_000_000;
const EXPECTED_SENDER: &str = "tmHjGSKdxF1xHQRSBaGnmiTvVXmfoM6Smxp";

#[derive(Clone, Default)]
struct MemoryBlockCache {
    blocks: Arc<Mutex<Vec<CompactBlock>>>,
}

impl MemoryBlockCache {
    fn sorted_blocks(&self) -> Vec<CompactBlock> {
        let mut blocks = self.blocks.lock().expect("block cache mutex poisoned").clone();
        blocks.sort_by_key(|block| block.height);
        blocks
    }
}

impl BlockSource for MemoryBlockCache {
    type Error = std::io::Error;

    fn with_blocks<F, WalletErrT>(
        &self,
        from_height: Option<BlockHeight>,
        limit: Option<usize>,
        mut with_block: F,
    ) -> Result<(), ChainError<WalletErrT, Self::Error>>
    where
        F: FnMut(CompactBlock) -> Result<(), ChainError<WalletErrT, Self::Error>>,
    {
        let start = from_height.map_or(0, u32::from);
        let blocks = self
            .sorted_blocks()
            .into_iter()
            .filter(|block| block.height as u32 >= start)
            .take(limit.unwrap_or(usize::MAX));
        for block in blocks {
            with_block(block)?;
        }
        Ok(())
    }
}

#[async_trait]
impl BlockCache for MemoryBlockCache {
    fn get_tip_height(
        &self,
        range: Option<&zcash_client_backend::data_api::scanning::ScanRange>,
    ) -> Result<Option<BlockHeight>, Self::Error> {
        let blocks = self.sorted_blocks();
        Ok(blocks
            .iter()
            .filter(|block| {
                range.is_none_or(|requested| {
                    requested
                        .block_range()
                        .contains(&BlockHeight::from_u32(block.height as u32))
                })
            })
            .map(|block| BlockHeight::from_u32(block.height as u32))
            .max())
    }

    async fn read(
        &self,
        range: &zcash_client_backend::data_api::scanning::ScanRange,
    ) -> Result<Vec<CompactBlock>, Self::Error> {
        let start = range.block_range().start;
        let end = range.block_range().end;
        let blocks: Vec<_> = self
            .sorted_blocks()
            .into_iter()
            .filter(|block| {
                let height = BlockHeight::from_u32(block.height as u32);
                range.block_range().contains(&height)
            })
            .collect();
        if blocks.first().is_some_and(|block| block.height as u32 != u32::from(start)) {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "compact block cache has a non-contiguous short read",
            ));
        }
        if blocks.is_empty() && start < end {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "compact block cache range is empty",
            ));
        }
        Ok(blocks)
    }

    async fn insert(&self, compact_blocks: Vec<CompactBlock>) -> Result<(), Self::Error> {
        self.blocks
            .lock()
            .expect("block cache mutex poisoned")
            .extend(compact_blocks);
        Ok(())
    }

    async fn delete(
        &self,
        range: zcash_client_backend::data_api::scanning::ScanRange,
    ) -> Result<(), Self::Error> {
        self.blocks
            .lock()
            .expect("block cache mutex poisoned")
            .retain(|block| {
                !range
                    .block_range()
                    .contains(&BlockHeight::from_u32(block.height as u32))
            });
        Ok(())
    }
}

#[derive(Clone, Copy)]
struct Config {
    birthday: BlockHeight,
    funding_height: BlockHeight,
    funding_value: Zatoshis,
}

struct Args {
    mode: String,
    request_uri: Option<String>,
    memo: Option<String>,
    db_path: PathBuf,
    mnemonic_path: PathBuf,
    recipient_seed_path: PathBuf,
    lightwalletd: String,
    funding_txid: TxId,
    config: Config,
}

fn usage() -> ! {
    eprintln!(
        "usage: nu63-testnet-sender --mode derive|inspect|broadcast [--request-uri URI --memo MEMO] [--db-path PATH]"
    );
    std::process::exit(2);
}

fn parse_args() -> Result<Args> {
    let mut mode = None;
    let mut request_uri = None;
    let mut memo = None;
    let mut db_path = PathBuf::from("zcash-payment-sessions-current-sender.sqlite");
    let mut mnemonic_path = PathBuf::from(DEFAULT_SENDER_MNEMONIC);
    let mut recipient_seed_path = PathBuf::from(DEFAULT_RECIPIENT_SEED);
    let lightwalletd = std::env::var("LIGHTWALLETD_URL")
        .unwrap_or_else(|_| DEFAULT_LIGHTWALLETD.to_owned());
    let mut funding_txid = TxId::from_hex(DEFAULT_FUNDING_TXID)
        .ok_or_else(|| anyhow!("invalid built-in funding txid"))?;
    let mut birthday = DEFAULT_BIRTHDAY;
    let mut funding_height = DEFAULT_FUNDING_HEIGHT;
    let mut funding_value = DEFAULT_FUNDING_VALUE;

    let mut args = std::env::args().skip(1);
    fn next_value<I: Iterator<Item = String>>(args: &mut I, name: &str) -> Result<String> {
        args.next().ok_or_else(|| anyhow!("missing value for {name}"))
    }
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--mode" => mode = Some(next_value(&mut args, "--mode")?),
            "--request-uri" => request_uri = Some(next_value(&mut args, "--request-uri")?),
            "--memo" => memo = Some(next_value(&mut args, "--memo")?),
            "--db-path" => db_path = PathBuf::from(next_value(&mut args, "--db-path")?),
            "--mnemonic-path" => mnemonic_path = PathBuf::from(next_value(&mut args, "--mnemonic-path")?),
            "--recipient-seed-path" => {
                recipient_seed_path = PathBuf::from(next_value(&mut args, "--recipient-seed-path")?)
            }
            "--funding-txid" => {
                let text = next_value(&mut args, "--funding-txid")?;
                funding_txid = TxId::from_hex(&text).ok_or_else(|| anyhow!("invalid funding txid"))?;
            }
            "--birthday" => birthday = next_value(&mut args, "--birthday")?.parse()?,
            "--funding-height" => funding_height = next_value(&mut args, "--funding-height")?.parse()?,
            "--funding-value" => funding_value = next_value(&mut args, "--funding-value")?.parse()?,
            _ => usage(),
        }
    }

    let mode = mode.unwrap_or_else(|| usage());
    ensure!(matches!(mode.as_str(), "derive" | "inspect" | "broadcast"), "invalid mode");
    if matches!(mode.as_str(), "inspect" | "broadcast") {
        ensure!(request_uri.is_some(), "--request-uri is required for this mode");
        ensure!(memo.is_some(), "--memo is required for this mode");
        ensure!(!db_path.exists(), "refusing to reuse an existing harness database");
    }

    Ok(Args {
        mode,
        request_uri,
        memo,
        db_path,
        mnemonic_path,
        recipient_seed_path,
        lightwalletd,
        funding_txid,
        config: Config {
            birthday: BlockHeight::from_u32(birthday),
            funding_height: BlockHeight::from_u32(funding_height),
            funding_value: Zatoshis::from_u64(funding_value)?,
        },
    })
}

fn read_sender_usk(path: &Path, network: &Network) -> Result<UnifiedSpendingKey> {
    let phrase = fs::read_to_string(path)
        .with_context(|| format!("could not read sender credential at {}", path.display()))?;
    let mnemonic = Mnemonic::<English>::from_phrase(phrase.trim())
        .map_err(|_| anyhow!("sender credential is not a valid BIP39 mnemonic"))?;
    let seed = mnemonic.to_seed("");
    UnifiedSpendingKey::from_seed(network, &seed, zip32::AccountId::try_from(1)?)
        .map_err(|_| anyhow!("sender HD account 1 derivation failed"))
}

fn read_recipient_ufvk(path: &Path, network: &Network) -> Result<UnifiedFullViewingKey> {
    let seed = fs::read(path)
        .with_context(|| format!("could not read recipient viewing material at {}", path.display()))?;
    ensure!(seed.len() >= 32, "recipient viewing material is too short");
    let usk = UnifiedSpendingKey::from_seed(network, &seed, zip32::AccountId::try_from(0)?)
        .map_err(|_| anyhow!("recipient viewing material derivation failed"))?;
    Ok(usk.to_unified_full_viewing_key())
}

fn public_addresses(
    sender_usk: &UnifiedSpendingKey,
    recipient_ufvk: &UnifiedFullViewingKey,
    network: &Network,
) -> Result<(String, TransparentAddress, String)> {
    let (sender_ua, _) = sender_usk
        .to_unified_full_viewing_key()
        .default_address(UnifiedAddressRequest::AllAvailableKeys)?;
    let sender_taddr = *sender_ua
        .transparent()
        .ok_or_else(|| anyhow!("sender account has no transparent receiver"))?;
    let sender_text = sender_taddr.encode(network);
    ensure!(sender_text == EXPECTED_SENDER, "sender HD account 1 address mismatch");

    let (recipient_ua, _) = recipient_ufvk.default_address(UnifiedAddressRequest::AllAvailableKeys)?;
    let recipient_sapling = *recipient_ua
        .sapling()
        .ok_or_else(|| anyhow!("recipient viewing material has no Sapling receiver"))?;
    let recipient_text = encode_payment_address_p(network, &recipient_sapling);
    Ok((sender_text, sender_taddr, recipient_text))
}

async fn connect(url: &str) -> Result<CompactTxStreamerClient<tonic::transport::Channel>> {
    let channel = tonic::transport::Endpoint::from_shared(url.to_owned())?
        .tls_config(tonic::transport::ClientTlsConfig::new().with_webpki_roots())?
        .connect()
        .await?;
    Ok(CompactTxStreamerClient::new(channel))
}

async fn current_tip(
    client: &mut CompactTxStreamerClient<tonic::transport::Channel>,
) -> Result<(BlockHeight, String)> {
    let info = client.get_lightd_info(Empty {}).await?.into_inner();
    ensure!(info.chain_name == "test", "lightwalletd is not serving testnet");
    let height = BlockHeight::from_u32(info.block_height.try_into()?);
    Ok((height, info.consensus_branch_id))
}

async fn open_and_sync(
    db_path: &Path,
    sender_seed: &SecretVec<u8>,
    network: &Network,
    client: &mut CompactTxStreamerClient<tonic::transport::Channel>,
    config: Config,
) -> Result<(WalletDb<rusqlite::Connection, Network, SystemClock, UnwrapErr<SysRng>>, zcash_client_sqlite::AccountUuid)> {
    let prior_height = u32::from(config.birthday)
        .checked_sub(1)
        .ok_or_else(|| anyhow!("birthday cannot be zero"))?;
    let tree_state = client
        .get_tree_state(BlockId {
            height: prior_height as u64,
            hash: vec![],
        })
        .await?
        .into_inner();
    let birthday = AccountBirthday::from_treestate(tree_state, None)?;
    ensure!(birthday.height() == config.birthday, "tree state birthday mismatch");

    let mut db = WalletDb::for_path(db_path, *network, SystemClock, UnwrapErr(SysRng))?;
    init_wallet_db(&mut db, None).map_err(|error| anyhow!("wallet database initialization failed: {error:?}"))?;
    let (account, _) = db.import_account_hd(
        "sender-hd1-current-consensus",
        sender_seed,
        zip32::AccountId::try_from(1)?,
        &birthday,
        None,
    )?;

    let cache = MemoryBlockCache::default();
    zcash_client_backend::sync::run(client, network, &cache, &mut db, 1000)
        .await
        .map_err(|error| anyhow!("current-consensus wallet sync failed: {error:?}"))?;
    let summary = db
        .get_wallet_summary(ConfirmationsPolicy::MIN)?
        .ok_or_else(|| anyhow!("wallet summary unavailable after sync"))?;
    ensure!(summary.chain_tip_height() >= config.funding_height, "wallet tip predates funding output");
    ensure!(summary.fully_scanned_height() >= config.funding_height, "wallet did not fully scan funding height");
    Ok((db, account.id()))
}

fn parse_request(uri: &str, memo_text: &str, recipient_sapling: &str) -> Result<TransactionRequest> {
    let request = TransactionRequest::from_uri(uri)?;
    ensure!(request.payments().len() == 1, "ZIP-321 request must contain exactly one payment");
    let payment = request
        .payments()
        .values()
        .next()
        .ok_or_else(|| anyhow!("ZIP-321 request has no payment"))?;
    ensure!(payment.amount() == Some(Zatoshis::const_from_u64(10_000)), "ZIP-321 amount mismatch");
    ensure!(payment.memo().is_some_and(|memo| memo.as_slice() == memo_text.as_bytes()), "ZIP-321 memo mismatch");
    let address = Address::try_from_zcash_address(
        &Network::TestNetwork,
        payment.recipient_address().clone(),
    )
    .map_err(|error| anyhow!("ZIP-321 recipient address is invalid: {error:?}"))?;
    match address {
        Address::Sapling(sapling) => {
            let encoded = encode_payment_address_p(&Network::TestNetwork, &sapling);
            ensure!(encoded == recipient_sapling, "ZIP-321 recipient mismatch");
        }
        _ => bail!("ZIP-321 recipient is not a Sapling address"),
    }
    Ok(request)
}

async fn assert_canonical_utxo(
    client: &mut CompactTxStreamerClient<tonic::transport::Channel>,
    sender_text: &str,
    funding_txid: TxId,
    config: Config,
) -> Result<u32> {
    let reply = client
        .get_address_utxos(GetAddressUtxosArg {
            addresses: vec![sender_text.to_owned()],
            start_height: u32::from(config.birthday) as u64,
            max_entries: 0,
        })
        .await?
        .into_inner();
    let matches: Vec<_> = reply
        .address_utxos
        .into_iter()
        .filter(|utxo| utxo.txid.as_slice() == funding_txid.as_ref())
        .filter(|utxo| utxo.address == sender_text)
        .filter(|utxo| utxo.value_zat == config.funding_value.into_u64() as i64)
        .collect();
    ensure!(matches.len() == 1, "canonical funding UTXO was not uniquely located");
    let utxo = &matches[0];
    ensure!(utxo.height == u32::from(config.funding_height) as u64, "funding height mismatch");
    println!("FUNDING_OUTPOINT={}:{}", funding_txid, utxo.index);
    println!("FUNDING_HEIGHT={}", utxo.height);
    println!("FUNDING_VALUE_ZAT={}", utxo.value_zat);
    Ok(utxo.index as u32)
}

fn assert_proposal<NoteRef: Copy>(
    proposal: &zcash_client_backend::proposal::Proposal<StandardFeeRule, NoteRef>,
    request: &TransactionRequest,
    sender_taddr: TransparentAddress,
    funding_txid: TxId,
    funding_index: u32,
    branch: BranchId,
) -> Result<(Zatoshis, Zatoshis)> {
    ensure!(proposal.steps().len() == 1, "payment requires exactly one transaction step");
    let step = proposal.steps().first();
    ensure!(step.transaction_request() == request, "proposal request differs from parsed ZIP-321 request");
    ensure!(step.payment_pools().values().all(|pool| *pool == zcash_protocol::PoolType::Shielded(ShieldedPool::Sapling)), "payment was not assigned to Sapling");
    ensure!(step.transparent_inputs().len() == 1, "proposal selected an unexpected number of transparent inputs");
    let input = &step.transparent_inputs()[0];
    ensure!(input.outpoint().txid() == &funding_txid, "proposal selected the wrong funding transaction");
    ensure!(input.outpoint().n() == funding_index, "proposal selected the wrong funding output");
    ensure!(input.recipient_address() == &sender_taddr, "proposal selected the wrong transparent sender address");
    let change = step.balance().proposed_change();
    ensure!(change.len() == 1, "proposal created unexpected change outputs");
    ensure!(change[0].output_pool() == zcash_protocol::PoolType::Shielded(ShieldedPool::Sapling), "proposal created non-Sapling change");
    let fee = step.balance().fee_required();
    let change_value = change[0].value();
    println!("ACTIVE_BRANCH_ID=0x{:08X}", u32::from(branch));
    println!("PROPOSAL_TARGET_HEIGHT={}", u32::from(proposal.min_target_height()));
    println!("PAYMENT_AMOUNT_ZAT={}", request.payments().values().next().unwrap().amount().unwrap().into_u64());
    println!("FEE_ZAT={}", fee.into_u64());
    println!("CHANGE_POOL=Sapling");
    println!("CHANGE_VALUE_ZAT={}", change_value.into_u64());
    Ok((fee, change_value))
}

async fn run_live(args: Args, broadcast: bool) -> Result<()> {
    let network = Network::TestNetwork;
    let sender_usk = read_sender_usk(&args.mnemonic_path, &network)?;
    let recipient_ufvk = read_recipient_ufvk(&args.recipient_seed_path, &network)?;
    let (sender_text, sender_taddr, recipient_sapling) = public_addresses(&sender_usk, &recipient_ufvk, &network)?;
    let phrase = fs::read_to_string(&args.mnemonic_path)?;
    let mnemonic = Mnemonic::<English>::from_phrase(phrase.trim())
        .map_err(|_| anyhow!("sender credential is not a valid BIP39 mnemonic"))?;
    let sender_seed = SecretVec::new(mnemonic.to_seed("").to_vec());

    let mut client = connect(&args.lightwalletd).await?;
    let (tip, server_branch) = current_tip(&mut client).await?;
    let branch = BranchId::for_height(&network, tip);
    ensure!(u32::from(branch) == u32::from(BranchId::for_height(&network, tip)), "branch calculation changed during setup");
    ensure!(tip >= args.config.funding_height, "current tip predates funding output");

    let uri = args.request_uri.as_deref().unwrap();
    let memo = args.memo.as_deref().unwrap();
    let request = parse_request(uri, memo, &recipient_sapling)?;
    let (mut db, account_id) = open_and_sync(&args.db_path, &sender_seed, &network, &mut client, args.config).await?;

    let funding_index = assert_canonical_utxo(&mut client, &sender_text, args.funding_txid, args.config).await?;
    let input_selector = GreedyInputSelector::new();
    let change_strategy = SingleOutputChangeStrategy::new(
        StandardFeeRule::Zip317,
        None,
        ShieldedPool::Sapling,
        DustOutputPolicy::default(),
    );
    let spend_policy = SpendPolicy::shielded_pools([ShieldedPool::Sapling])
        .with_transparent(TransparentSpendPolicy::from_one_address(sender_taddr));
    let proposal = propose_transfer::<
        _,
        _,
        _,
        _,
        zcash_client_sqlite::error::SqliteClientError,
    >(
        &mut db,
        &network,
        account_id,
        &input_selector,
        &change_strategy,
        request.clone(),
        ConfirmationsPolicy::MIN,
        &spend_policy,
        None,
        None,
    )
    .map_err(|error| anyhow!("current-consensus proposal failed: {error:?}"))?;
    let (fee, change_value) = assert_proposal(
        &proposal,
        &request,
        sender_taddr,
        args.funding_txid,
        funding_index,
        branch,
    )?;
    println!("LIGHTWALLETD_TIP={}", u32::from(tip));
    println!("LIGHTWALLETD_BRANCH={}", server_branch);
    println!("SENDER_TRANSPARENT_ADDRESS={}", sender_text);
    println!("RECIPIENT_SAPLING_ADDRESS={}", recipient_sapling);
    println!("LIBRUSTZCASH_REV={LIBRUSTZCASH_REV}");
    println!("BROADCAST_REQUESTED={broadcast}");

    if !broadcast {
        return Ok(());
    }

    let mut rng = UnwrapErr(SysRng);
    let txids = create_proposed_transactions::<
        _,
        _,
        std::convert::Infallible,
        _,
        std::convert::Infallible,
        _,
    >(
        &mut db,
        &network,
        &SystemClock,
        &mut rng,
        &zcash_proofs::prover::LocalTxProver::bundled(),
        &zcash_proofs::prover::LocalTxProver::bundled(),
        &zcash_client_backend::data_api::wallet::SpendingKeys::from_unified_spending_key(sender_usk),
        OvkPolicy::Sender,
        &proposal,
        None,
    )?;
    ensure!(txids.len() == 1, "prover produced unexpected transaction count");
    let txid = *txids.first();
    let transaction = db
        .get_transaction(txid)?
        .ok_or_else(|| anyhow!("proved transaction bytes were not retained by wallet DB"))?;
    ensure!(transaction.consensus_branch_id() == branch, "proved transaction has the wrong consensus branch");
    let mut raw = Vec::new();
    transaction.write(&mut raw)?;
    let parsed = Transaction::read(raw.as_slice(), branch)?;
    ensure!(parsed.txid() == txid, "serialized transaction txid mismatch");
    ensure!(parsed.transparent_bundle().is_some(), "transaction has no transparent input bundle");
    ensure!(parsed.sapling_bundle().is_some(), "transaction has no Sapling output bundle");
    ensure!(parsed.orchard_bundle().is_none(), "transaction unexpectedly contains an Orchard bundle");
    println!("PREBROADCAST_TXID={txid}");
    println!("PREBROADCAST_FEE_ZAT={}", fee.into_u64());
    println!("PREBROADCAST_CHANGE_ZAT={}", change_value.into_u64());
    let response = client
        .send_transaction(RawTransaction { data: raw, height: 0 })
        .await?
        .into_inner();
    ensure!(response.error_code == 0, "canonical testnet rejected the transaction: {}", response.error_message);
    println!("BROADCAST_ACCEPTED=true");
    println!("TXID={txid}");

    for _ in 0..120 {
        let status = client
            .get_transaction(service::TxFilter {
                block: None,
                index: 0,
                hash: txid.as_ref().to_vec(),
            })
            .await;
        if let Ok(response) = status {
            let height = response.into_inner().height;
            if height != 0 && height != u64::MAX {
                println!("MINED_HEIGHT={height}");
                println!("CONFIRMATIONS_AT_OBSERVATION={}", u32::from(tip).saturating_sub(height as u32) + 1);
                return Ok(());
            }
        }
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
    bail!("transaction was accepted but not mined within the bounded observation window")
}

#[tokio::main]
async fn main() -> Result<()> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let args = parse_args()?;
    if args.mode == "derive" {
        let network = Network::TestNetwork;
        let sender_usk = read_sender_usk(&args.mnemonic_path, &network)?;
        let recipient_ufvk = read_recipient_ufvk(&args.recipient_seed_path, &network)?;
        let (sender_text, _, recipient_sapling) = public_addresses(&sender_usk, &recipient_ufvk, &network)?;
        println!("SENDER_TRANSPARENT_ADDRESS={sender_text}");
        println!("RECIPIENT_SAPLING_ADDRESS={recipient_sapling}");
        println!("LIBRUSTZCASH_REV={LIBRUSTZCASH_REV}");
        return Ok(());
    }
    let broadcast = args.mode == "broadcast";
    run_live(args, broadcast).await
}
