import { describe, expect, it } from "vitest";
import {
  createSaplingMemoHydrator,
  type SaplingMemoHydratorModule
} from "../src/memo-hydration.js";
import { PaymentMonitor } from "../src/monitor.js";
import { createPaymentSession } from "../src/session.js";
import {
  PaymentSessionStore,
  type KeyValueStorage
} from "../src/storage.js";
import {
  WebZjsPaymentSource,
  type WebZjsReceivedPayment,
  type WebZjsRawTransaction,
  type WebZjsWalletLike
} from "../src/wallet.js";

const TXID =
  "e44c2b4a89bc66e581ead9ce96f83ea03785a283e9821122f0093ea7f3b69e3c";
const PAYMENT_ID = `${TXID}:sapling:1`;
const MEMO = "zps-live-sapling-2026-10-10T09:19:09.452Z-298a227d-6efb-420f-8171-21f4f368f480";
const UFVK = "runtime-only-recipient-ufvk";

class MemoryStorage implements KeyValueStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  valuesText(): string {
    return [...this.values.entries()]
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");
  }
}

class FakeWallet implements WebZjsWalletLike {
  payments: WebZjsReceivedPayment[] = [];
  raw: WebZjsRawTransaction = {
    data: new Uint8Array([6, 0, 0, 128]),
    height: 4_484_801
  };

  async get_received_payments(): Promise<{ payments: WebZjsReceivedPayment[] }> {
    return { payments: this.payments };
  }

  async get_transaction(): Promise<WebZjsRawTransaction> {
    return this.raw;
  }
}

function compactPayment(
  overrides: Partial<WebZjsReceivedPayment> = {}
): WebZjsReceivedPayment {
  return {
    payment_id: PAYMENT_ID,
    txid: TXID,
    value: 10_000n,
    memo: undefined,
    block_height: 4_484_801,
    confirmations: 1,
    status: 0,
    pool: "sapling",
    ...overrides
  };
}

function moduleReturning(result: unknown): SaplingMemoHydratorModule {
  return {
    hydrate_sapling_payment: () => result
  };
}

function sourceFor(
  wallet: FakeWallet,
  result: unknown = {
    txid: TXID,
    pool: "sapling",
    output_index: 1,
    value: 10_000n,
    memo: MEMO
  }
): WebZjsPaymentSource {
  return new WebZjsPaymentSource(
    wallet,
    1,
    createSaplingMemoHydrator({
      module: moduleReturning(result),
      get_transaction: wallet.get_transaction.bind(wallet),
      recipientUfvk: UFVK
    })
  );
}

async function expectNoHydratedMemo(
  source: WebZjsPaymentSource
): Promise<void> {
  const [payment] = await source.list();
  expect(payment).toBeDefined();
  expect(payment).not.toHaveProperty("memo");
}

describe("current-consensus Sapling memo hydration", () => {
  it("hydrates the exact output identity and value", async () => {
    const wallet = new FakeWallet();
    wallet.payments = [compactPayment()];

    await expect(sourceFor(wallet).list()).resolves.toMatchObject([
      {
        paymentId: PAYMENT_ID,
        amountZatoshis: 10_000n,
        memo: MEMO,
        pool: "sapling"
      }
    ]);
  });

  it("does not attach evidence for a wrong output index or value", async () => {
    const wallet = new FakeWallet();
    wallet.payments = [compactPayment()];

    await expectNoHydratedMemo(
      sourceFor(wallet, {
        txid: TXID,
        pool: "sapling",
        output_index: 0,
        value: 10_000n,
        memo: MEMO
      })
    );

    await expectNoHydratedMemo(
      sourceFor(wallet, {
        txid: TXID,
        pool: "sapling",
        output_index: 1,
        value: 10_001n,
        memo: MEMO
      })
    );
  });

  it("does not attach evidence for a wrong transaction id or recipient", async () => {
    const wallet = new FakeWallet();
    wallet.payments = [compactPayment()];

    await expectNoHydratedMemo(
      sourceFor(wallet, {
        txid: "0000000000000000000000000000000000000000000000000000000000000000",
        pool: "sapling",
        output_index: 1,
        value: 10_000n,
        memo: MEMO
      })
    );
  });

  it("turns malformed or non-decrypting WASM results into a safe no-match", async () => {
    const wallet = new FakeWallet();
    wallet.payments = [compactPayment()];

    const throwingSource = new WebZjsPaymentSource(
      wallet,
      1,
      createSaplingMemoHydrator({
        module: {
          hydrate_sapling_payment: () => {
            throw new Error("malformed transaction");
          }
        },
        get_transaction: wallet.get_transaction.bind(wallet),
        recipientUfvk: UFVK
      })
    );
    await expectNoHydratedMemo(throwingSource);

    await expectNoHydratedMemo(sourceFor(wallet, null));
  });

  it("rejects stale raw transaction height and never hydrates pending outputs", async () => {
    const wallet = new FakeWallet();
    wallet.payments = [compactPayment({ block_height: 4_484_800 })];
    await expectNoHydratedMemo(sourceFor(wallet));

    wallet.payments = [compactPayment({ status: 1, block_height: undefined })];
    await expectNoHydratedMemo(sourceFor(wallet));
  });

  it("does not leak the runtime UFVK into session persistence", () => {
    const storage = new MemoryStorage();
    const sessions = new PaymentSessionStore(storage);
    sessions.save(
      createPaymentSession({
        amountZatoshis: 10_000n,
        memo: MEMO,
        expiresInMs: 7_200_000
      })
    );

    expect(storage.valuesText()).not.toContain(UFVK);
  });

  it("preserves hydrated matching, consumed identity, and confirmations across reload", async () => {
    const storage = new MemoryStorage();
    const sessions = new PaymentSessionStore(storage);
    const monitor = new PaymentMonitor(sessions, storage, {
      requiredConfirmations: 2
    });
    const wallet = new FakeWallet();
    wallet.payments = [compactPayment({ confirmations: 0 })];
    const source = sourceFor(wallet);
    const session = createPaymentSession({
      amountZatoshis: 10_000n,
      memo: MEMO,
      expiresInMs: 7_200_000
    });
    sessions.save(session);

    expect(monitor.observe(session.id, await source.list()).outcome).toBe(
      "EXACT"
    );
    wallet.payments = [compactPayment({ confirmations: 1 })];
    const reloadedMonitor = new PaymentMonitor(
      new PaymentSessionStore(storage),
      storage,
      { requiredConfirmations: 2 }
    );
    expect(
      reloadedMonitor.observe(session.id, await source.list()).outcome
    ).toBe("EXACT");
    wallet.payments = [compactPayment({ confirmations: 2 })];
    expect(
      reloadedMonitor.observe(session.id, await source.list()).outcome
    ).toBe("EXACT");
    expect(new PaymentSessionStore(storage).load(session.id)?.status).toBe(
      "PAID"
    );

    const second = createPaymentSession({
      amountZatoshis: 10_000n,
      memo: MEMO,
      expiresInMs: 7_200_000
    });
    new PaymentSessionStore(storage).save(second);
    expect(
      reloadedMonitor.observe(second.id, await source.list()).outcome
    ).toBe("ALREADY_CONSUMED");
  });
});
