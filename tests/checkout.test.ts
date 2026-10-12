import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import { ZcashPaymentSessions } from "zcash-payment-sessions";
import {
  CheckoutDemoController,
  type CheckoutViewState
} from "../examples/checkout/src/controller.js";
import { SimulatedWallet } from "../examples/checkout/src/simulated-wallet.js";
import {
  REAL_TESTNET_MODE_NOTICE,
  getRealTestnetModeAvailability
} from "../examples/checkout/src/runtime-capabilities.js";
import { createPaymentQrSvg } from "../examples/checkout/src/qr.js";
import type {
  WebZjsReceivedPayment,
  WebZjsWalletLike
} from "zcash-payment-sessions";
import type { KeyValueStorage } from "zcash-payment-sessions";

const RECIPIENT_ADDRESS =
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
  wallet?: WebZjsWalletLike;
  now?: () => number;
} = {}) {
  const storage = options.storage ?? new MemoryStorage();
  const wallet = options.wallet ?? new SimulatedWallet();
  const sdk = await ZcashPaymentSessions.create({
    storage,
    recipientAddress: RECIPIENT_ADDRESS,
    wallet,
    accountId: 0,
    now: options.now,
    wasmInput: wasm
  });

  return { sdk, storage, wallet };
}

function payment(
  overrides: Partial<WebZjsReceivedPayment> = {}
): WebZjsReceivedPayment {
  return {
    payment_id: "demo-tx:orchard:0",
    txid: "demo-tx",
    value: 25_000_000n,
    memo: "demo-order",
    block_height: 2_000_000,
    confirmations: 0,
    status: 1,
    pool: "orchard",
    ...overrides
  };
}

async function createController(options: {
  storage?: MemoryStorage;
  wallet?: WebZjsWalletLike;
  now?: () => number;
} = {}) {
  const setupResult = await setup(options);
  const controller = new CheckoutDemoController(
    setupResult.sdk,
    setupResult.storage
  );
  return { ...setupResult, controller };
}

describe("checkout demo public-SDK integration", () => {
  it("gates real testnet mode without browser isolation and keeps simulation available", () => {
    expect(getRealTestnetModeAvailability(false)).toEqual({
      realTestnetEnabled: false,
      simulationEnabled: true,
      notice: REAL_TESTNET_MODE_NOTICE
    });
    expect(getRealTestnetModeAvailability(true)).toEqual({
      realTestnetEnabled: true,
      simulationEnabled: true,
      notice: ""
    });
  });

  it("creates a session through the public facade", async () => {
    const { controller } = await createController();

    const state = await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });

    expect(state.session?.status).toBe("AWAITING_PAYMENT");
    expect(state.session?.paymentUri).toMatch(/^zcash:/);
  });

  it("exposes the generated URI unchanged to the QR boundary", async () => {
    const { controller } = await createController();
    const state = await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });
    const captured: string[] = [];

    const svg = createPaymentQrSvg(state.session!.paymentUri, (uri) => {
      captured.push(uri);
      return "<svg data-qr />";
    });

    expect(captured).toEqual([state.session!.paymentUri]);
    expect(svg).toBe("<svg data-qr />");
  });

  it("renders a QR SVG with the maintained QR encoder", async () => {
    const { controller } = await createController();
    const state = await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });

    const svg = createPaymentQrSvg(state.session!.paymentUri);

    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain("viewBox=");
  });

  it("restores the active session after controller reload", async () => {
    const { controller, storage, sdk } = await createController();
    const created = await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });

    const reloaded = new CheckoutDemoController(sdk, storage);
    const state = await reloaded.restore();

    expect(state.session).toEqual(created.session);
  });

  it("shows DETECTED for a simulated exact payment", async () => {
    const { controller, wallet } = await createController();
    await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });
    wallet.payments = [payment()];

    const state = await controller.refresh();

    expect(state.session?.status).toBe("DETECTED");
  });

  it("reaches PAID through simulated confirmation progression", async () => {
    const { controller, wallet } = await createController();
    await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });
    wallet.payments = [payment()];
    await controller.refresh();
    wallet.payments = [payment({ confirmations: 1, status: 0 })];
    await controller.refresh();
    wallet.payments = [payment({ confirmations: 2, status: 0 })];

    const state = await controller.refresh();

    expect(state.session?.status).toBe("PAID");
  });

  it("keeps duplicate simulated refreshes idempotent", async () => {
    const { controller, wallet } = await createController();
    await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });
    wallet.payments = [payment()];
    await controller.refresh();
    wallet.payments = [payment({ confirmations: 1, status: 0 })];
    await controller.refresh();
    wallet.payments = [payment({ confirmations: 2, status: 0 })];
    await controller.refresh();

    const repeated = await controller.refresh();

    expect(repeated.observation?.outcome).toBe("EXACT");
    expect(repeated.session?.status).toBe("PAID");
  });

  it("renders AMBIGUOUS for two exact simulated outputs", async () => {
    const { controller, wallet } = await createController();
    await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });
    wallet.payments = [
      payment({ payment_id: "a:orchard:0", txid: "a" }),
      payment({ payment_id: "b:orchard:0", txid: "b" })
    ];

    const state = await controller.refresh();

    expect(state.observation?.outcome).toBe("AMBIGUOUS");
    expect(state.session?.status).toBe("AWAITING_PAYMENT");
  });

  it("renders REORGED when a paid simulated output reorgs", async () => {
    const { controller, wallet } = await createController();
    await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });
    wallet.payments = [payment()];
    await controller.refresh();
    wallet.payments = [payment({ confirmations: 1, status: 0 })];
    await controller.refresh();
    wallet.payments = [payment({ confirmations: 2, status: 0 })];
    await controller.refresh();
    wallet.payments = [payment({ status: 3 })];

    const state = await controller.refresh();

    expect(state.session?.status).toBe("REORGED");
  });

  it("renders EXPIRED for a late simulated payment", async () => {
    const { controller, wallet } = await createController({
      now: () => Number.MAX_SAFE_INTEGER
    });
    await controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order",
      expiresInMs: 1
    });
    wallet.payments = [payment({ status: 0, confirmations: 10 })];

    const state = await controller.refresh();

    expect(state.observation?.outcome).toBe("NO_MATCH");
    expect(state.session?.status).toBe("EXPIRED");
  });

  it("keeps session state intact when switching demo controllers", async () => {
    const first = await createController();
    await first.controller.createSession({
      amountZatoshis: 25_000_000n,
      memo: "demo-order"
    });
    first.wallet.payments = [payment()];
    await first.controller.refresh();

    const second = await createController({
      storage: first.storage,
      wallet: new SimulatedWallet()
    });
    const state = await second.controller.restore();

    expect(state.session?.status).toBe("DETECTED");
    expect(JSON.stringify(publicState(state))).not.toContain("seed");
    expect(JSON.stringify(publicState(state))).not.toContain("private");
  });
});

function publicState(state: CheckoutViewState): unknown {
  return {
    sessionId: state.session?.id,
    status: state.session?.status,
    paymentUri: state.session?.paymentUri,
    observation: state.observation?.outcome
  };
}
