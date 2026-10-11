use std::collections::HashMap;

use serde::Serialize;
use wasm_bindgen::prelude::*;
use zcash_client_backend::decrypt_transaction;
use zcash_keys::keys::UnifiedFullViewingKey;
use zcash_primitives::transaction::Transaction;
use zcash_protocol::consensus::{BlockHeight, BranchId, Network};
use zcash_protocol::memo::Memo;

#[derive(Debug, Serialize)]
struct HydratedPayment {
    txid: String,
    pool: &'static str,
    output_index: u32,
    value: u64,
    memo: String,
}

fn error(message: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&message.to_string())
}

/// Decrypts exactly one expected Sapling output from a complete transaction.
///
/// The transaction parser and trial decryption are provided by the current pinned
/// librustzcash revision. No transaction serialization or Sapling cryptography is implemented
/// here. The UFVK is accepted only at runtime and is never returned or persisted.
#[wasm_bindgen]
pub fn hydrate_sapling_payment(
    raw_transaction: &[u8],
    mined_height: u32,
    recipient_ufvk: &str,
    expected_txid: &str,
    expected_output_index: u32,
    expected_value: u64,
) -> Result<JsValue, JsValue> {
    let height = BlockHeight::from_u32(mined_height);
    let transaction = Transaction::read(
        raw_transaction,
        BranchId::for_height(&Network::TestNetwork, height),
    )
    .map_err(error)?;

    let actual_txid = hex::encode(transaction.txid().as_ref());
    if actual_txid != expected_txid {
        return Err(error(format!(
            "transaction id mismatch: expected {expected_txid}, got {actual_txid}"
        )));
    }

    let ufvk = UnifiedFullViewingKey::decode(&Network::TestNetwork, recipient_ufvk)
        .map_err(error)?;
    let mut ufvks = HashMap::new();
    ufvks.insert(1u32, ufvk);
    let decrypted = decrypt_transaction(
        &Network::TestNetwork,
        Some(height),
        None,
        &transaction,
        &ufvks,
    );

    let output = decrypted
        .sapling_outputs()
        .iter()
        .find(|output| output.index() == expected_output_index as usize)
        .ok_or_else(|| error("transaction does not decrypt to the expected Sapling output"))?;

    let value = output.note_value().into_u64();
    if value != expected_value {
        return Err(error(format!(
            "value mismatch: expected {expected_value}, got {value}"
        )));
    }

    let memo = Memo::try_from(output.memo().clone())
        .map_err(error)?;
    let memo = match memo {
        Memo::Text(text) if !text.is_empty() => text.to_string(),
        _ => return Err(error("expected a non-empty UTF-8 Sapling memo")),
    };

    serde_wasm_bindgen::to_value(&HydratedPayment {
        txid: actual_txid,
        pool: "sapling",
        output_index: expected_output_index,
        value,
        memo,
    })
    .map_err(error)
}
