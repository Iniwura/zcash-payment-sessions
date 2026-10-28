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

  /**
   * Atomically claim a key for one owner, returning the existing owner when
   * another writer won the claim. Browser adapters should implement this
   * with Web Locks or a transactional durable store.
   */
  claimItem?: (
    key: string,
    owner: string
  ) => string | null | Promise<string | null>;
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

    let session: PaymentSession;
    try {
      session = deserializePaymentSession(encoded);
    } catch {
      // A corrupted browser record must not make every subsequent SDK call
      // throw. It is not trusted as payment state and is removed so a new
      // session can be created cleanly.
      this.storage.removeItem(this.key(id));
      return null;
    }
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
