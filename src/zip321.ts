import initWebZjsRequests, {
  PaymentRequest,
  TransactionRequest,
  type InitInput
} from "@chainsafe/webzjs-requests";

export type Zip321OtherParams = readonly (readonly [string, string])[];

export interface CreateZip321UriInput {
  recipientAddress: string;
  amountZatoshis: bigint;
  memo?: string;
  label?: string;
  message?: string;
  otherParams?: Zip321OtherParams;
}

export interface DecodedZip321Payment {
  recipientAddress: string;
  amountZatoshis: bigint | undefined;
  memo: string | undefined;
  label: string | undefined;
  message: string | undefined;
  otherParams: Zip321OtherParams;
}

export interface DecodedZip321Uri {
  totalZatoshis: bigint | undefined;
  payments: DecodedZip321Payment[];
}

let initialization: Promise<void> | undefined;

export function initializeZip321(
  wasmInput?: InitInput | Promise<InitInput>
): Promise<void> {
  if (initialization !== undefined) {
    return initialization;
  }

  initialization = (wasmInput === undefined
    ? initWebZjsRequests()
    : initWebZjsRequests({ module_or_path: wasmInput })
  ).then(
    () => undefined,
    (error: unknown) => {
      initialization = undefined;
      throw error;
    }
  );

  return initialization;
}

export async function createZip321Uri(
  input: CreateZip321UriInput
): Promise<string> {
  await initializeZip321();

  const payment = new PaymentRequest(
    input.recipientAddress,
    input.amountZatoshis,
    input.memo === undefined
      ? undefined
      : new TextEncoder().encode(input.memo),
    input.label,
    input.message,
    input.otherParams ?? []
  );

  const request = new TransactionRequest([payment]);

  try {
    return request.to_uri();
  } finally {
    request.free();
  }
}

export async function decodeZip321Uri(
  uri: string
): Promise<DecodedZip321Uri> {
  await initializeZip321();

  const request = TransactionRequest.from_uri(uri);

  try {
    const payments = request.payment_requests();
    const remainingPayments = new Set(payments);

    try {
      return {
        totalZatoshis: request.total(),
        payments: payments.map((payment) => {
          try {
            const memo = payment.memo();
            const memoText =
              memo === undefined ? undefined : new TextDecoder().decode(memo);

            return {
              recipientAddress: payment.recipient_address(),
              amountZatoshis: payment.amount(),
              memo:
                memoText === undefined
                  ? undefined
                  : memoText.replace(/\0+$/, ""),
              label: payment.label(),
              message: payment.message(),
              otherParams: payment.other_params() as Zip321OtherParams
            };
          } finally {
            payment.free();
            remainingPayments.delete(payment);
          }
        })
      };
    } finally {
      for (const payment of remainingPayments) {
        payment.free();
      }
    }
  } finally {
    request.free();
  }
}
