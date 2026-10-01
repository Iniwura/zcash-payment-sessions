import type {
  WebZjsReceivedPayment,
  WebZjsReceivedPaymentResponse,
  WebZjsWalletLike
} from "zcash-payment-sessions";

export class SimulatedWallet implements WebZjsWalletLike {
  payments: WebZjsReceivedPayment[] = [];

  async get_received_payments(
    _accountId: number
  ): Promise<WebZjsReceivedPaymentResponse> {
    return {
      payments: this.payments.map((payment) => ({ ...payment }))
    };
  }
}
