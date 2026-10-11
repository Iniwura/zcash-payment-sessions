import type { WebWallet } from "@chainsafe/webzjs-wallet";
import type { KeyValueStorage } from "./storage.js";
import type {
  WebZjsReceivedPaymentResponse,
  WebZjsRawTransaction,
  WebZjsWalletLike
} from "./wallet.js";

export type BrowserWalletNetwork = "main" | "test";

export interface WebZjsBrowserWalletOptions {
  network: BrowserWalletNetwork;
  lightwalletdUrl: string;
  storage: KeyValueStorage;
  storageKey?: string;
  minConfirmationsTrusted?: number;
  minConfirmationsUntrusted?: number;
  threadCount?: number;
}

export interface BrowserWalletState {
  network: BrowserWalletNetwork;
  syncStatus: "idle" | "syncing" | "synced" | "error";
  accountId: number | undefined;
  chainTipHeight: number | undefined;
  fullyScannedHeight: number | undefined;
  error: string | undefined;
}

export type BrowserWalletErrorCode =
  | "INVALID_OPTIONS"
  | "INITIALIZATION_FAILED"
  | "RESTORE_FAILED"
  | "ACCOUNT_REQUIRED"
  | "SYNC_FAILED"
  | "PERSISTENCE_FAILED";

export class WebZjsBrowserWalletError extends Error {
  constructor(
    readonly code: BrowserWalletErrorCode,
    message: string
  ) {
    super(message);
    this.name = "WebZjsBrowserWalletError";
  }
}

type WebZjsWalletModule = typeof import("@chainsafe/webzjs-wallet");

let webzjsInitialization: Promise<WebZjsWalletModule> | undefined;

export class WebZjsBrowserWallet implements WebZjsWalletLike {
  private readonly storageKey: string;
  private accountId: number | undefined;
  private disposed = false;
  private currentState: BrowserWalletState;

  private constructor(
    private readonly wallet: WebWallet,
    private readonly options: WebZjsBrowserWalletOptions
  ) {
    this.storageKey =
      options.storageKey ??
      `zcash-webzjs-wallet:${options.network}:db`;
    this.currentState = {
      network: options.network,
      syncStatus: "idle",
      accountId: undefined,
      chainTipHeight: undefined,
      fullyScannedHeight: undefined,
      error: undefined
    };
  }

  static async open(
    options: WebZjsBrowserWalletOptions
  ): Promise<WebZjsBrowserWallet> {
    validateOptions(options);
    const webzjs = await initializeWebZjs(options.threadCount);

    const storageKey =
      options.storageKey ??
      `zcash-webzjs-wallet:${options.network}:db`;
    const encoded = options.storage.getItem(storageKey);
    let bytes: Uint8Array | null = null;

    if (encoded !== null) {
      try {
        bytes = decodeBase64(encoded);
      } catch {
        throw new WebZjsBrowserWalletError(
          "RESTORE_FAILED",
          "The persisted WebZjs wallet database is invalid"
        );
      }
    }

    let wallet: WebWallet;
    try {
      wallet = new webzjs.WebWallet(
        options.network,
        options.lightwalletdUrl,
        options.minConfirmationsTrusted ?? 1,
        options.minConfirmationsUntrusted ?? 1,
        bytes
      );
    } catch {
      throw new WebZjsBrowserWalletError(
        "RESTORE_FAILED",
        "WebZjs could not open the wallet database"
      );
    }

    const adapter = new WebZjsBrowserWallet(wallet, options);
    await adapter.refreshState();
    return adapter;
  }

  async get_received_payments(
    accountId: number
  ): Promise<WebZjsReceivedPaymentResponse> {
    this.assertOpen();
    return this.wallet.get_received_payments(accountId);
  }

  async get_transaction(txid: Uint8Array): Promise<WebZjsRawTransaction> {
    this.assertOpen();
    const raw = await this.wallet.get_transaction(txid);
    return {
      data: raw.data,
      height: Number(raw.height)
    };
  }

  async getState(): Promise<BrowserWalletState> {
    this.assertOpen();
    await this.refreshState();
    return { ...this.currentState };
  }

  getAccountId(): number | undefined {
    this.assertOpen();
    return this.accountId;
  }

  async getCurrentAddress(): Promise<string> {
    this.assertOpen();
    if (this.accountId === undefined) {
      throw new WebZjsBrowserWalletError(
        "ACCOUNT_REQUIRED",
        "Create or restore a wallet account before requesting an address"
      );
    }

    try {
      return await this.wallet.get_current_address(this.accountId);
    } catch {
      throw new WebZjsBrowserWalletError(
        "ACCOUNT_REQUIRED",
        "WebZjs could not derive the current wallet address"
      );
    }
  }

  async createViewOnlyAccount(input: {
    accountName: string;
    ufvk: string;
    birthdayHeight?: number;
  }): Promise<number> {
    this.assertOpen();
    if (input.ufvk.trim().length === 0) {
      throw new WebZjsBrowserWalletError(
        "ACCOUNT_REQUIRED",
        "A Unified Full Viewing Key is required"
      );
    }

    try {
      const accountId = await this.wallet.create_account_view_ufvk(
        input.accountName,
        input.ufvk,
        input.birthdayHeight
      );
      this.accountId = accountId;
      await this.persist();
      await this.refreshState();
      return accountId;
    } catch {
      throw new WebZjsBrowserWalletError(
        "ACCOUNT_REQUIRED",
        "WebZjs could not create the view-only account"
      );
    }
  }

  async sync(): Promise<BrowserWalletState> {
    this.assertOpen();
    this.currentState = {
      ...this.currentState,
      syncStatus: "syncing",
      error: undefined
    };

    try {
      await this.wallet.sync();
      await this.persist();
      await this.refreshState();
      this.currentState = {
        ...this.currentState,
        syncStatus: "synced"
      };
      return { ...this.currentState };
    } catch {
      this.currentState = {
        ...this.currentState,
        syncStatus: "error",
        error: "WebZjs wallet synchronization failed"
      };
      throw new WebZjsBrowserWalletError(
        "SYNC_FAILED",
        "WebZjs wallet synchronization failed"
      );
    }
  }

  async persist(): Promise<void> {
    this.assertOpen();

    try {
      const bytes = await this.wallet.db_to_bytes();
      this.options.storage.setItem(
        this.storageKey,
        encodeBase64(bytes)
      );
    } catch {
      throw new WebZjsBrowserWalletError(
        "PERSISTENCE_FAILED",
        "WebZjs wallet database persistence failed"
      );
    }
  }

  close(): void {
    if (!this.disposed) {
      this.wallet.free();
      this.disposed = true;
    }
  }

  private async refreshState(): Promise<void> {
    let summary;

    try {
      summary = await this.wallet.get_wallet_summary();
    } catch {
      return;
    }

    if (summary === undefined) {
      return;
    }

    try {
      const accountBalances = summary.account_balances as unknown;
      if (this.accountId === undefined && Array.isArray(accountBalances)) {
        const firstAccount = accountBalances[0];
        if (
          Array.isArray(firstAccount) &&
          typeof firstAccount[0] === "number"
        ) {
          this.accountId = firstAccount[0];
        }
      }

      this.currentState = {
        ...this.currentState,
        accountId: this.accountId,
        chainTipHeight: summary.chain_tip_height,
        fullyScannedHeight: summary.fully_scanned_height
      };
    } finally {
      summary.free();
    }
  }

  private assertOpen(): void {
    if (this.disposed) {
      throw new WebZjsBrowserWalletError(
        "INITIALIZATION_FAILED",
        "The WebZjs wallet has been closed"
      );
    }
  }
}

async function initializeWebZjs(
  threadCount = defaultThreadCount()
): Promise<WebZjsWalletModule> {
  if (webzjsInitialization !== undefined) {
    return webzjsInitialization;
  }

  webzjsInitialization = (async () => {
    try {
      const webzjs = await import("@chainsafe/webzjs-wallet");
      await webzjs.default();
      await webzjs.initThreadPool(threadCount);
      return webzjs;
    } catch {
      webzjsInitialization = undefined;
      throw new WebZjsBrowserWalletError(
        "INITIALIZATION_FAILED",
        "WebZjs browser initialization failed"
      );
    }
  })();

  return webzjsInitialization;
}

function validateOptions(options: WebZjsBrowserWalletOptions): void {
  if (options.lightwalletdUrl.trim().length === 0) {
    throw new WebZjsBrowserWalletError(
      "INVALID_OPTIONS",
      "A gRPC-web lightwalletd URL is required"
    );
  }

  if (options.network !== "main" && options.network !== "test") {
    throw new WebZjsBrowserWalletError(
      "INVALID_OPTIONS",
      "WebZjs network must be main or test"
    );
  }
}

function defaultThreadCount(): number {
  const concurrency = globalThis.navigator?.hardwareConcurrency;
  return typeof concurrency === "number" && concurrency > 0
    ? concurrency
    : 4;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize)
    );
  }

  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
