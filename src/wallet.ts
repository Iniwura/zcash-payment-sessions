import type { WebWallet } from "@chainsafe/webzjs-wallet";
import type {
  ObservedPayment,
  ObservedPaymentStatus,
  PaymentObservationIssue,
  PaymentObservationBatch
} from "./monitor.js";

export interface WebZjsReceivedPayment {
  payment_id: string;
  txid: string;
  value: bigint;
  memo: string | undefined;
  block_height: number | undefined;
  confirmations: number;
  status: number | WebZjsReceivedPaymentStatus;
  pool: string;
}

export type WebZjsReceivedPaymentStatus =
  | "Mined"
  | "Pending"
  | "Expired"
  | "Reorged";

export interface WebZjsReceivedPaymentResponse {
  payments: readonly WebZjsReceivedPayment[];
  free?: () => void;
}

export interface HydratedReceivedPaymentEvidence {
  txid: string;
  pool: string;
  outputIndex: number;
  value: bigint;
  memo: string;
}

export interface WebZjsRawTransaction {
  data: Uint8Array;
  height: number;
}

export interface WebZjsRawTransactionFetcher {
  get_transaction(txid: Uint8Array): Promise<WebZjsRawTransaction>;
}

export type WebZjsPaymentHydrator = (
  payment: WebZjsReceivedPayment
) => Promise<HydratedReceivedPaymentEvidence | undefined>;

/**
 * Joins full-transaction evidence to one compact-wallet observation.
 *
 * The join is deliberately restricted to the stable output identity encoded by WebZjs as
 * `<txid>:<pool>:<output-index>`, and it also rechecks the compact value. Missing or empty memos
 * remain incomplete observations and cannot be used by Payment Sessions.
 */
export function mergeHydratedReceivedPayment(
  compact: WebZjsReceivedPayment,
  evidence: HydratedReceivedPaymentEvidence
): WebZjsReceivedPayment | undefined {
  const separator = compact.payment_id.lastIndexOf(":");
  const poolSeparator = compact.payment_id.lastIndexOf(":", separator - 1);
  if (separator <= 0 || poolSeparator <= 0) {
    return undefined;
  }

  const compactTxid = compact.payment_id.slice(0, poolSeparator);
  const compactPool = compact.payment_id.slice(
    poolSeparator + 1,
    separator
  );
  const outputIndexText = compact.payment_id.slice(separator + 1);
  const compactOutputIndex = Number(outputIndexText);

  if (
    !Number.isSafeInteger(compactOutputIndex) ||
    compactOutputIndex < 0 ||
    compactTxid !== compact.txid ||
    compactPool !== compact.pool ||
    compactTxid !== evidence.txid ||
    compactPool !== evidence.pool ||
    compactOutputIndex !== evidence.outputIndex ||
    compact.value !== evidence.value ||
    evidence.memo.length === 0
  ) {
    return undefined;
  }

  if (compact.memo !== undefined && compact.memo !== evidence.memo) {
    return undefined;
  }

  return { ...compact, memo: evidence.memo };
}

export interface WebZjsWalletLike {
  get_received_payments(
    accountId: number
  ): Promise<WebZjsReceivedPaymentResponse>;
  get_transaction?(
    txid: Uint8Array
  ): Promise<WebZjsRawTransaction>;
}

export type WebZjsWallet = Pick<
  WebWallet,
  "get_received_payments" | "get_transaction"
>;

export class WebZjsPaymentSource {
  constructor(
    private readonly wallet: WebZjsWalletLike,
    private readonly accountId: number,
    private readonly hydrator?: WebZjsPaymentHydrator
  ) {}

  async list(): Promise<ObservedPayment[]> {
    const result = await this.listDetailed();
    return [...result.payments];
  }

  async listDetailed(): Promise<PaymentObservationBatch> {
    let response: WebZjsReceivedPaymentResponse;

    try {
      response = await this.wallet.get_received_payments(
        this.accountId
      );
    } catch {
      return {
        payments: [],
        issues: [{ kind: "UPSTREAM_UNAVAILABLE" }]
      };
    }

    const issues: PaymentObservationIssue[] = [];

    try {
      const payments = response.payments.flatMap((payment) => {
        const normalized = normalizeWebZjsReceivedPayment(payment);
        if (normalized === undefined) {
          issues.push({
            kind: "INVALID_OBSERVATION",
            paymentId: payment.payment_id
          });
          return [];
        }
        return [normalized];
      });
      const hydratedPayments = await Promise.all(
        payments.map(async (payment) => {
          if (this.hydrator === undefined || payment.memo !== undefined) {
            if (payment.memo === undefined) {
              issues.push({
                kind: "INCOMPLETE_METADATA",
                paymentId: payment.payment_id
              });
            }
            return payment;
          }

          try {
            const evidence = await this.hydrator(payment);
            if (evidence === undefined) {
              issues.push({
                kind: "INCOMPLETE_METADATA",
                paymentId: payment.payment_id
              });
              return payment;
            }

            const merged = mergeHydratedReceivedPayment(payment, evidence);
            if (merged === undefined) {
              issues.push({
                kind: "INCOMPLETE_METADATA",
                paymentId: payment.payment_id
              });
              return payment;
            }

            return merged;
          } catch {
            issues.push({
              kind: "HYDRATION_UNAVAILABLE",
              paymentId: payment.payment_id
            });
            return payment;
          }
        })
      );

      return {
        payments: hydratedPayments.flatMap((payment) => {
          let status: ObservedPaymentStatus;
          try {
            status = mapWebZjsStatus(payment.status);
          } catch {
            issues.push({
              kind: "INVALID_OBSERVATION",
              paymentId: payment.payment_id
            });
            return [];
          }

          return [{
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
            status,
            pool: payment.pool
          }];
        }),
        issues
      };
    } finally {
      response.free?.();
    }
  }
}

function normalizeWebZjsReceivedPayment(
  payment: WebZjsReceivedPayment
): WebZjsReceivedPayment | undefined {
  if (typeof payment.value === "bigint") {
    return payment;
  }

  if (
    typeof payment.value !== "number" ||
    !Number.isSafeInteger(payment.value) ||
    payment.value < 0
  ) {
    return undefined;
  }

  return { ...payment, value: BigInt(payment.value) };
}

function mapWebZjsStatus(
  status: number | WebZjsReceivedPaymentStatus
): ObservedPaymentStatus {
  switch (status) {
    case 0:
    case "Mined":
      return "MINED";
    case 1:
    case "Pending":
      return "PENDING";
    case 2:
    case "Expired":
      return "EXPIRED";
    case 3:
    case "Reorged":
      return "REORGED";
    default:
      throw new Error(
        "Unknown WebZjs received payment status: " + status
      );
  }
}
