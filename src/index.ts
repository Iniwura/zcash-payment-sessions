import type { InitInput } from "@chainsafe/webzjs-requests";
export {
  WebZjsBrowserWallet,
  WebZjsBrowserWalletError,
  type BrowserWalletErrorCode,
  type BrowserWalletNetwork,
  type BrowserWalletState,
  type WebZjsBrowserWalletOptions
} from "./browser-wallet.js";
import {
  createPaymentSession,
  type CreatePaymentSessionInput,
  type PaymentSession
} from "./session.js";
import {
  PaymentMonitor,
  type PaymentObservationResult
} from "./monitor.js";
import {
  PaymentSessionStore,
  type KeyValueStorage
} from "./storage.js";
import {
  createZip321Uri,
  initializeZip321,
  type Zip321OtherParams
} from "./zip321.js";
import {
  WebZjsPaymentSource,
  type WebZjsReceivedPayment,
  type WebZjsReceivedPaymentResponse,
  type WebZjsWalletLike
} from "./wallet.js";

const URI_PREFIX = "zcash-payment-session-uri:";

export interface ZcashPaymentSessionsOptions {
  storage: KeyValueStorage;
  recipientAddress: string;
  wallet?: WebZjsWalletLike;
  accountId?: number;
  requiredConfirmations?: number;
  now?: () => number;
  wasmInput?: InitInput | Promise<InitInput>;
}

export interface CreateSessionInput
  extends Omit<CreatePaymentSessionInput, "memo"> {
  memo: string;
  label?: string;
  message?: string;
  otherParams?: Zip321OtherParams;
}

export interface PublicPaymentSession extends PaymentSession {
  paymentUri: string;
}

export interface RefreshPaymentSessionResult {
  session: PublicPaymentSession | null;
  observation: PaymentObservationResult;
}

export class ZcashPaymentSessions {
  private constructor(
    private readonly storage: KeyValueStorage,
    private readonly sessions: PaymentSessionStore,
    private readonly monitor: PaymentMonitor,
    private readonly paymentSource: WebZjsPaymentSource | undefined,
    private readonly recipientAddress: string
  ) {}

  static async create(
    options: ZcashPaymentSessionsOptions
  ): Promise<ZcashPaymentSessions> {
    await initializeZip321(options.wasmInput);

    const sessions = new PaymentSessionStore(options.storage, options.now);
    const monitor = new PaymentMonitor(sessions, options.storage, {
      ...(options.requiredConfirmations === undefined
        ? {}
        : { requiredConfirmations: options.requiredConfirmations }),
      ...(options.now === undefined ? {} : { now: options.now })
    });
    const paymentSource =
      options.wallet === undefined
        ? undefined
        : new WebZjsPaymentSource(
            options.wallet,
            options.accountId ?? 0
          );

    return new ZcashPaymentSessions(
      options.storage,
      sessions,
      monitor,
      paymentSource,
      options.recipientAddress
    );
  }

  async createSession(
    input: CreateSessionInput
  ): Promise<PublicPaymentSession> {
    const session = createPaymentSession({
      amountZatoshis: input.amountZatoshis,
      memo: input.memo,
      ...(input.expiresInMs === undefined
        ? {}
        : { expiresInMs: input.expiresInMs })
    });
    const paymentUri = await createZip321Uri({
      recipientAddress: this.recipientAddress,
      amountZatoshis: input.amountZatoshis,
      memo: input.memo,
      ...(input.label === undefined ? {} : { label: input.label }),
      ...(input.message === undefined ? {} : { message: input.message }),
      ...(input.otherParams === undefined
        ? {}
        : { otherParams: input.otherParams })
    });

    this.sessions.save(session);
    this.storage.setItem(this.uriKey(session.id), paymentUri);

    return { ...session, paymentUri };
  }

  getSession(id: string): PublicPaymentSession | null {
    const session = this.sessions.load(id);
    const paymentUri = this.storage.getItem(this.uriKey(id));

    if (session === null || paymentUri === null) {
      return null;
    }

    return { ...session, paymentUri };
  }

  async refresh(id: string): Promise<RefreshPaymentSessionResult> {
    if (this.paymentSource === undefined) {
      throw new Error(
        "A wallet is required to refresh payment sessions"
      );
    }

    const observations = await this.paymentSource.list();
    const observation = this.monitor.observe(id, observations);

    return {
      session: this.getSession(id),
      observation
    };
  }

  private uriKey(id: string): string {
    return URI_PREFIX + id;
  }
}

export type {
  KeyValueStorage,
  PaymentObservationResult,
  WebZjsReceivedPayment,
  WebZjsReceivedPaymentResponse,
  WebZjsWalletLike,
  Zip321OtherParams
};
