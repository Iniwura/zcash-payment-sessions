import {
  ZcashPaymentSessions,
  type CreateSessionInput,
  type KeyValueStorage,
  type PaymentObservationResult,
  type PublicPaymentSession
} from "zcash-payment-sessions";

const ACTIVE_SESSION_KEY = "zcash-checkout-demo:active-session";

export interface CheckoutViewState {
  session: PublicPaymentSession | null;
  observation: PaymentObservationResult | undefined;
  error: string | undefined;
}

export class CheckoutDemoController {
  private state: CheckoutViewState = {
    session: null,
    observation: undefined,
    error: undefined
  };

  constructor(
    private readonly sdk: ZcashPaymentSessions,
    private readonly storage: KeyValueStorage
  ) {}

  get view(): CheckoutViewState {
    return {
      ...this.state,
      session:
        this.state.session === null
          ? null
          : { ...this.state.session },
      observation: this.state.observation
    };
  }

  async restore(): Promise<CheckoutViewState> {
    const id = this.storage.getItem(ACTIVE_SESSION_KEY);
    this.state = {
      session: id === null ? null : this.sdk.getSession(id),
      observation: undefined,
      error: undefined
    };
    return this.view;
  }

  async createSession(
    input: CreateSessionInput
  ): Promise<CheckoutViewState> {
    const session = await this.sdk.createSession(input);
    this.storage.setItem(ACTIVE_SESSION_KEY, session.id);
    this.state = {
      session,
      observation: undefined,
      error: undefined
    };
    return this.view;
  }

  async refresh(): Promise<CheckoutViewState> {
    const id = this.storage.getItem(ACTIVE_SESSION_KEY);
    if (id === null) {
      this.state = {
        session: null,
        observation: undefined,
        error: "Create a payment session first"
      };
      return this.view;
    }

    try {
      const result = await this.sdk.refresh(id);
      this.state = {
        session: result.session,
        observation: result.observation,
        error: undefined
      };
    } catch (error) {
      this.state = {
        ...this.state,
        error: error instanceof Error ? error.message : "Refresh failed"
      };
    }

    return this.view;
  }

  reset(): CheckoutViewState {
    this.storage.removeItem(ACTIVE_SESSION_KEY);
    this.state = {
      session: null,
      observation: undefined,
      error: undefined
    };
    return this.view;
  }
}
