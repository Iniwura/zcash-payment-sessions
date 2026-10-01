import {
  expirePaymentSession,
  type PaymentSession
} from "./session.js";
import {
  deserializePaymentSession,
  serializePaymentSession
} from "./persistence.js";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_PREFIX = "zcash-payment-session:";

export class PaymentSessionStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number = Date.now
  ) {}

  private key(id: string): string {
    return `${STORAGE_PREFIX}${id}`;
  }

  save(session: PaymentSession): void {
    this.storage.setItem(
      this.key(session.id),
      serializePaymentSession(session)
    );
  }

  load(id: string): PaymentSession | null {
    const encoded = this.storage.getItem(this.key(id));

    if (encoded === null) {
      return null;
    }

    const session = deserializePaymentSession(encoded);
    const current = expirePaymentSession(session, this.now());

    if (current !== session) {
      this.save(current);
    }

    return current;
  }

  remove(id: string): void {
    this.storage.removeItem(this.key(id));
  }
}
