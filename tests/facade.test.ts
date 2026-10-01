import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import {
  ZcashPaymentSessions,
  type PublicPaymentSession
} from "../src/index.js";
import type {
  WebZjsReceivedPayment,
  WebZjsReceivedPaymentResponse,
  WebZjsWalletLike
} from "../src/wallet.js";
import type { KeyValueStorage } from "../src/storage.js";
import { decodeZip321Uri } from "../src/zip321.js";

const SHIELDED_ADDRESS =
  "u1mcxxpa0wyyd3qpkl8rftsa6n7tkh9lv8u8j3zpd9f6qz37dqwur38w6tfl5rpv7m8g8mlca7nyn7qxr5qtjemjqehcttwpupz3fk76q8ft82yh4scnyxrxf2jgywgr5f9ttzh8ah8ljpmr8jzzypm2gdkcfxyh4ad93c889qv3l4pa748945c372ku7kdglu388zsjvrg9dskr0v9zj";

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
}

class FakeWallet implements WebZjsWalletLike {
  payments: WebZjsReceivedPayment[] = [];

  async get_received_payments(
    _accountId: number
  ): Promise<WebZjsReceivedPaymentResponse> {
    return { payments: this.payments };
  }
}

let wasm: Uint8Array;

beforeAll(async () => {
  wasm = new Uint8Array(
    await readFile(
      new URL(
        "../node_modules/@chainsafe/webzjs-requests/webzjs_requests_bg.wasm",
        import.meta.url
      )
    )
  );
});

async function setup(options: {
  storage?: MemoryStorage;
  wallet?: FakeWallet;
  now?: () => number;
  requiredConfirmations?: number;
} = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const wallet = options.wallet ?? new FakeWallet();
  const sessions = await ZcashPaymentSessions.create({
    storage,
    recipientAddress: SHIELDED_ADDRESS,
    wallet,
    accountId: 0,
    now: options.now,
    requiredConfirmations: options.requiredConfirmations,
    wasmInput: wasm
  });

  return { sessions, storage, wallet };
}

async function createSession(
  sessions: ZcashPaymentSessions,
  expiresInMs?: number
): Promise<PublicPaymentSession> {
  return sessions.createSession({
    amountZatoshis: 25_000_000n,
    memo: "order-1842",
    ...(expiresInMs === undefined ? {} : { expiresInMs })
  });
}

function payment(
  overrides: Partial<WebZjsReceivedPayment> = {}
): WebZjsReceivedPayment {
  return {
    payment_id: "tx-1842:orchard:0",
    txid: "tx-1842",
    value: 25_000_000n,
    memo: "order-1842",
    block_height: 2_000_000,
    confirmations: 0,
    status: 1,
    pool: "orchard",
    ...overrides
  };
}

describe("ZcashPaymentSessions public facade", () => {
  it("creates and persists a session with a WebZjs ZIP-321 URI", async () => {
    const { sessions } = await setup();

    const created = await createSession(sessions);

    expect(created.status).toBe("AWAITING_PAYMENT");
    expect(created.paymentUri).toMatch(/^zcash:/);
    await expect(decodeZip321Uri(created.paymentUri)).resolves.toMatchObject({
      totalZatoshis: 25_000_000n,
      payments: [
        expect.objectContaining({
          recipientAddress: SHIELDED_ADDRESS,
          amountZatoshis: 25_000_000n,
          memo: "order-1842"
        })
      ]
    });
    expect(sessions.getSession(created.id)).toEqual(created);
  });

  it("reloads a persisted session and its payment URI", async () => {
    const { sessions, storage } = await setup();
    const created = await createSession(sessions);
    const reloaded = (await setup({ storage })).sessions.getSession(
      created.id
    );

    expect(reloaded).toEqual(created);
  });

  it("refreshes from the wallet and detects an exact payment", async () => {
    const { sessions, wallet } = await setup();
    const created = await createSession(sessions);
    wallet.payments = [payment()];

    const refreshed = await sessions.refresh(created.id);

    expect(refreshed.observation.outcome).toBe("EXACT");
    expect(refreshed.session?.status).toBe("DETECTED");
  });

  it("advances exact payments through confirmation to PAID", async () => {
    const { sessions, wallet } = await setup();
    const created = await createSession(sessions);

    wallet.payments = [payment()];
    await sessions.refresh(created.id);
    wallet.payments = [payment({ confirmations: 1, status: 0 })];
    expect((await sessions.refresh(created.id)).session?.status).toBe(
      "CONFIRMING"
    );
    wallet.payments = [payment({ confirmations: 2, status: 0 })];

    expect((await sessions.refresh(created.id)).session?.status).toBe("PAID");
  });

  it("keeps duplicate refreshes idempotent after PAID", async () => {
    const { sessions, wallet } = await setup();
    const created = await createSession(sessions);
    wallet.payments = [payment()];
    await sessions.refresh(created.id);
    wallet.payments = [payment({ confirmations: 1, status: 0 })];
    await sessions.refresh(created.id);
    wallet.payments = [payment({ confirmations: 2, status: 0 })];
    await sessions.refresh(created.id);

    const repeated = await sessions.refresh(created.id);

    expect(repeated.observation.outcome).toBe("EXACT");
    expect(repeated.session?.status).toBe("PAID");
  });

  it("does not credit one observed payment to a second session", async () => {
    const { sessions, wallet } = await setup();
    const first = await createSession(sessions);
    const second = await createSession(sessions);
    wallet.payments = [payment()];

    expect((await sessions.refresh(first.id)).observation.outcome).toBe(
      "EXACT"
    );
    const duplicate = await sessions.refresh(second.id);

    expect(duplicate.observation.outcome).toBe("ALREADY_CONSUMED");
    expect(duplicate.session?.status).toBe("AWAITING_PAYMENT");
  });

  it("leaves a session awaiting when matching outputs are ambiguous", async () => {
    const { sessions, wallet } = await setup();
    const created = await createSession(sessions);
    wallet.payments = [
      payment({ payment_id: "tx-a:orchard:0", txid: "tx-a" }),
      payment({ payment_id: "tx-b:orchard:1", txid: "tx-b" })
    ];

    const result = await sessions.refresh(created.id);

    expect(result.observation.outcome).toBe("AMBIGUOUS");
    expect(result.session?.status).toBe("AWAITING_PAYMENT");
  });

  it("records a reorg and can observe the payment again", async () => {
    const { sessions, wallet } = await setup();
    const created = await createSession(sessions);
    wallet.payments = [payment()];
    await sessions.refresh(created.id);
    wallet.payments = [payment({ confirmations: 1, status: 0 })];
    await sessions.refresh(created.id);
    wallet.payments = [payment({ confirmations: 2, status: 0 })];
    await sessions.refresh(created.id);
    wallet.payments = [payment({ confirmations: 0, status: 3 })];

    expect((await sessions.refresh(created.id)).session?.status).toBe(
      "REORGED"
    );
    wallet.payments = [payment({ confirmations: 1, status: 0 })];

    expect((await sessions.refresh(created.id)).session?.status).toBe(
      "DETECTED"
    );
  });

  it("expires a session and does not match a late payment", async () => {
    const { sessions, wallet } = await setup({
      now: () => Number.MAX_SAFE_INTEGER
    });
    const created = await createSession(sessions, 1);
    wallet.payments = [payment({ status: 0, confirmations: 10 })];

    const result = await sessions.refresh(created.id);

    expect(result.observation.outcome).toBe("NO_MATCH");
    expect(result.session?.status).toBe("EXPIRED");
  });

  it("preserves paid and consumed state after a facade restart", async () => {
    const { sessions, storage, wallet } = await setup();
    const paid = await createSession(sessions);
    wallet.payments = [payment()];
    await sessions.refresh(paid.id);
    wallet.payments = [payment({ confirmations: 1, status: 0 })];
    await sessions.refresh(paid.id);
    wallet.payments = [payment({ confirmations: 2, status: 0 })];
    await sessions.refresh(paid.id);

    const restarted = (await setup({ storage, wallet })).sessions;
    expect(restarted.getSession(paid.id)?.status).toBe("PAID");

    const duplicate = await createSession(restarted);
    const result = await restarted.refresh(duplicate.id);

    expect(result.observation.outcome).toBe("ALREADY_CONSUMED");
    expect(result.session?.status).toBe("AWAITING_PAYMENT");
  });
});
