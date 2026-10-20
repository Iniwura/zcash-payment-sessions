import {
  createSaplingMemoHydrator,
  type WebZjsBrowserWallet,
  type WebZjsPaymentHydrator,
  type SaplingMemoHydratorModule
} from "zcash-payment-sessions";

// wasm-pack's web-target output imports its own .wasm from the same directory.
// Keep this a browser-only, same-origin import. Never load WASM from the proxy.
interface BrowserHydrator extends SaplingMemoHydratorModule {
  default: (input?: RequestInfo | URL | Response | BufferSource | WebAssembly.Module) => Promise<unknown>;
}

type HydratorLoader = () => Promise<BrowserHydrator>;

export const BROWSER_HYDRATOR_ASSET =
  "/sapling-hydrator/sapling_memo_hydrator.js";

const defaultLoader: HydratorLoader = async () => {
  const module = await import(/* @vite-ignore */ BROWSER_HYDRATOR_ASSET);
  return module as BrowserHydrator;
};

let modulePromise: Promise<BrowserHydrator> | undefined;

async function getModule(loader: HydratorLoader): Promise<BrowserHydrator> {
  if (modulePromise === undefined) {
    modulePromise = loader().then(async (module) => {
      await module.default();
      return module;
    }).catch((error: unknown) => {
      modulePromise = undefined;
      throw error;
    });
  }
  return modulePromise;
}

/**
 * Binds the in-memory view-only testnet key to the current-consensus parser.
 * Only the wallet's compact observations and transaction bytes traverse
 * the gateway; the UFVK remains local to the browser runtime.
 */
export async function loadTestnetPaymentHydrator(
  wallet: WebZjsBrowserWallet,
  recipientUfvk: string,
  loader: HydratorLoader = defaultLoader
): Promise<WebZjsPaymentHydrator> {
  if (recipientUfvk.trim().length === 0) {
    throw new Error("A testnet view-only UFVK is required for memo verification");
  }
  if (typeof wallet.get_transaction !== "function") {
    throw new Error("The wallet does not provide full-transaction retrieval");
  }
  const module = await getModule(loader);
  return createSaplingMemoHydrator({
    module,
    get_transaction: wallet.get_transaction.bind(wallet),
    recipientUfvk
  });
}
