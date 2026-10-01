import type { WebWallet } from "@chainsafe/webzjs-wallet";
import type {
  ObservedPayment,
  ObservedPaymentStatus
} from "./monitor.js";

export interface WebZjsReceivedPayment {
  payment_id: string;
  txid: string;
  value: bigint;
  memo: string | undefined;
  block_height: number | undefined;
  confirmations: number;
  status: number;
  pool: string;
}

export interface WebZjsReceivedPaymentResponse {
  payments: readonly WebZjsReceivedPayment[];
  free?: () => void;
}

export interface WebZjsWalletLike {
  get_received_payments(
    accountId: number
  ): Promise<WebZjsReceivedPaymentResponse>;
}

export type WebZjsWallet = Pick<WebWallet, "get_received_payments">;

export class WebZjsPaymentSource {
  constructor(
    private readonly wallet: WebZjsWalletLike,
    private readonly accountId: number
  ) {}

  async list(): Promise<ObservedPayment[]> {
    const response = await this.wallet.get_received_payments(
      this.accountId
    );

    try {
      return response.payments.map((payment) => ({
        paymentId: payment.payment_id,
        txid: payment.txid,
        amountZatoshis: payment.value,
        ...(payment.memo === undefined
          ? {}
          : { memo: payment.memo }),
        ...(payment.block_height === undefined
          ? {}
          : { blockHeight: payment.block_height }),
        confirmations: payment.confirmations,
        status: mapWebZjsStatus(payment.status),
        pool: payment.pool
      }));
    } finally {
      response.free?.();
    }
  }
}

function mapWebZjsStatus(status: number): ObservedPaymentStatus {
  switch (status) {
    case 0:
      return "MINED";
    case 1:
      return "PENDING";
    case 2:
      return "EXPIRED";
    case 3:
      return "REORGED";
    default:
      throw new Error(
        "Unknown WebZjs received payment status: " + status
      );
  }
}
