import { CheckoutDemoController } from "./controller.js";

/**
 * Prepare a harmless, locally simulated request for reviewers.
 * This calls the same public SDK session creation path used by the checkout.
 * Real testnet view-only sessions never enter this function.
 */
export async function prepareReviewerSession(controller: CheckoutDemoController): Promise<void> {
  if (controller.view.session !== null) return;
  await controller.createSession({
    amountZatoshis: 10_000n,
    memo: "order-123",
    expiresInMs: 20 * 60 * 1000
  });
}
