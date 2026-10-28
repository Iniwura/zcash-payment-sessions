import {
  WebZjsBrowserWallet,
  ZcashPaymentSessions,
  type KeyValueStorage,
  type PaymentObservationResult,
  type PublicPaymentSession
} from "zcash-payment-sessions";
import { CheckoutDemoController } from "./controller.js";
import { prepareReviewerSession } from "./reviewer-session.js";
import { loadTestnetPaymentHydrator } from "./testnet-hydrator.js";
import { createPaymentQrSvg } from "./qr.js";
import { describeSessionException } from "./ui-state.js";
import { SimulatedWallet } from "./simulated-wallet.js";
import { getRealTestnetModeAvailability } from "./runtime-capabilities.js";
import { ProductTour } from "./product-tour.js";
import { MERCHANT_PROFILE_KEY, sealMerchantProfile, openMerchantProfile } from "./merchant-profile.js";
import {
  DEFAULT_TESTNET_GRPC_WEB_ENDPOINT,
  parseTestnetBirthday
} from "./testnet-config.js";
import "./style.css";

type DemoMode = "simulation" | "testnet";

interface Runtime {
  mode: DemoMode;
  sdk: ZcashPaymentSessions;
  controller: CheckoutDemoController;
  simulationWallet: SimulatedWallet | undefined;
  browserWallet: WebZjsBrowserWallet | undefined;
  simulationClock: SimulationClock | undefined;
  recipientAddress: string;
}

const TESTNET_DEMO_ADDRESS =
  "utest1ycg5ncs8djy6q7vtkgdmp72k7fsg9eu6xhlfgxxy078fxz0f9kmwr24ptgkyke0wzy2ajwda5k86p354pq0dnrrqatrtycjv5akz7hzlmrl0kjfdepkypc4232uzw75syda4hhr4hxxquehumczacfq9qzc8x4m4dff99s7mr6uqs9humt8gg3teqkkrmkcjeq8ztjsnfjr8umawlzg";

const elements = {
  modeBadge: required<HTMLElement>("mode-badge"),
  sessionBadge: required<HTMLElement>("session-badge"),
  amountDisplay: required<HTMLElement>("amount-display"),
  recipientDisplay: required<HTMLElement>("recipient-display"),
  qrFrame: required<HTMLElement>("qr-frame"),
  uriDisplay: required<HTMLTextAreaElement>("uri-display"),
  copyUri: required<HTMLButtonElement>("copy-uri"),
  countdown: required<HTMLElement>("countdown"),
  errorMessage: required<HTMLElement>("error-message"),
  modeTestnet: required<HTMLButtonElement>("mode-testnet"),
  guideRun: required<HTMLButtonElement>("guide-run"),
  guideStatus: required<HTMLElement>("guide-status"),
  realModeNotice: required<HTMLElement>("real-mode-notice"),
  realConfig: required<HTMLElement>("real-config"),
  walletConnectionStatus: required<HTMLElement>("wallet-connection-status"),
  simulationControls: required<HTMLElement>("simulation-controls"),
  amountInput: required<HTMLInputElement>("amount-input"),
  memoInput: required<HTMLInputElement>("memo-input"),
  lightwalletdUrl: required<HTMLInputElement>("lightwalletd-url"),
  viewingKey: required<HTMLInputElement>("viewing-key"),
  setupPassphrase: required<HTMLInputElement>("merchant-setup-passphrase"),
  unlockPassphrase: required<HTMLInputElement>("merchant-unlock-passphrase"),
  unlockProfileButton: required<HTMLButtonElement>("merchant-unlock"),
  forgetProfileButton: required<HTMLButtonElement>("merchant-forget"),
  merchantUnlock: required<HTMLElement>("merchant-unlock-panel"),
  merchantAdvanced: required<HTMLDetailsElement>("merchant-advanced"),
  birthdayHeight: required<HTMLInputElement>("birthday-height"),
  openTestnet: required<HTMLButtonElement>("open-testnet"),
  createSession: required<HTMLButtonElement>("create-session"),
  refreshStatus: required<HTMLButtonElement>("refresh-status"),
  resetDemo: required<HTMLButtonElement>("reset-demo"),
  lifecycleNote: required<HTMLElement>("lifecycle-note"),
  timeline: required<HTMLOListElement>("timeline"),
  exceptionState: required<HTMLElement>("exception-state"),
  detailSession: required<HTMLElement>("detail-session"),
  detailMemo: required<HTMLElement>("detail-memo"),
  detailPayment: required<HTMLElement>("detail-payment"),
  detailTxid: required<HTMLElement>("detail-txid"),
  detailConfirmations: required<HTMLElement>("detail-confirmations"),
  detailPool: required<HTMLElement>("detail-pool"),
  detailExpiry: required<HTMLElement>("detail-expiry"),
  detailMode: required<HTMLElement>("detail-mode")
};

const realTestnetMode = getRealTestnetModeAvailability(window.crossOriginIsolated);
const MODE_STORAGE_KEY = "checkout:active-mode";

function hasStoredMerchantProfile(): boolean {
  try { return window.localStorage.getItem(MERCHANT_PROFILE_KEY) !== null; }
  catch { return false; }
}

function renderMerchantOnboarding(): void {
  const saved = hasStoredMerchantProfile();
  elements.merchantUnlock.classList.toggle("hidden", !saved || mode !== "testnet");
  if (saved && mode === "testnet" && runtime?.browserWallet === undefined) {
    elements.merchantAdvanced.open = false;
  }
  if (runtime?.browserWallet !== undefined && mode === "testnet") {
    elements.merchantAdvanced.open = false;
    elements.merchantUnlock.classList.add("hidden");
  }
}

function getInitialMode(): DemoMode {
  try {
    const saved =
      window.sessionStorage.getItem(MODE_STORAGE_KEY) ??
      window.localStorage.getItem(MODE_STORAGE_KEY);
    if (saved === "simulation" || saved === "testnet") {
      if (saved === "testnet" && !realTestnetMode.realTestnetEnabled) {
        return "simulation";
      }
      return saved as DemoMode;
    }
  } catch {
    // Ignore storage access errors in restricted iframe contexts.
  }
  // Real testnet is the primary merchant experience on isolated deployments.
  // Simulation remains available only as an explicitly selected developer test.
  return realTestnetMode.realTestnetEnabled ? "testnet" : "simulation";
}

function saveActiveMode(nextMode: DemoMode): void {
  try {
    window.sessionStorage.setItem(MODE_STORAGE_KEY, nextMode);
    window.localStorage.setItem(MODE_STORAGE_KEY, nextMode);
  } catch {
    // Ignore storage access errors in restricted iframe contexts.
  }
}

let runtime: Runtime | undefined;
let mode: DemoMode = getInitialMode();
let guidedRunActive = false;
let openingTestnetWallet = false;
let walletConnectionEpoch = 0;

function createBrowserSessionStorage(prefix: string): KeyValueStorage {
  const fullKey = (key: string): string => `${prefix}${key}`;

  return {
    getItem: (key) => window.localStorage.getItem(fullKey(key)),
    setItem: (key, value) => window.localStorage.setItem(fullKey(key), value),
    removeItem: (key) => window.localStorage.removeItem(fullKey(key)),
    claimItem: async (key, owner) => {
      if (navigator.locks === undefined) {
        throw new Error("This browser does not provide Web Locks for payment claims");
      }

      return navigator.locks.request(
        `zcash-payment-claim:${fullKey(key)}`,
        async () => {
          const keyInStorage = fullKey(key);
          const existing = window.localStorage.getItem(keyInStorage);
          if (existing !== null) return existing;
          window.localStorage.setItem(keyInStorage, owner);
          return null;
        }
      );
    }
  };
}

const sessionStorage = createBrowserSessionStorage("checkout:");

// Keep reviewer simulation state separate from real chain observation state.
// A simulated checkout must never be restored into a view-only testnet wallet.
const testnetSessionStorage = createBrowserSessionStorage("checkout:testnet:");

// WebZjs serializes its wallet database, including view-only account records.
// Never place those serialized bytes unencrypted in localStorage. Until encrypted
// DB persistence is implemented, the wallet DB is isolated in volatile memory.
// Returning merchants unlock their encrypted profile and rescan from birthday.
const transientWalletDb = new Map<string, string>();
const walletStorage: KeyValueStorage = {
  getItem: (key) => transientWalletDb.get(key) ?? null,
  setItem: (key, value) => { transientWalletDb.set(key, value); },
  removeItem: (key) => { transientWalletDb.delete(key); }
};

class SimulationClock {
  private current = Date.now();

  now = (): number => this.current;

  expire(): void {
    this.current = Number.MAX_SAFE_INTEGER;
  }
}

async function createSimulationRuntime(): Promise<Runtime> {
  const simulationWallet = new SimulatedWallet();
  const simulationClock = new SimulationClock();
  const sdk = await ZcashPaymentSessions.create({
    storage: sessionStorage,
    recipientAddress: TESTNET_DEMO_ADDRESS,
    wallet: simulationWallet,
    accountId: 0,
    now: simulationClock.now
  });
  const controller = new CheckoutDemoController(sdk, sessionStorage);
  await controller.restore();
  await prepareReviewerSession(controller);

  return {
    mode: "simulation",
    sdk,
    controller,
    simulationWallet,
    browserWallet: undefined,
    simulationClock,
    recipientAddress: TESTNET_DEMO_ADDRESS
  };
}

async function openTestnetRuntime(viewingKeyOverride?: string): Promise<Runtime> {
  const lightwalletdUrl =
    elements.lightwalletdUrl.value.trim() ||
    DEFAULT_TESTNET_GRPC_WEB_ENDPOINT;
  if (lightwalletdUrl.length === 0) {
    throw new Error("Enter a verified browser-compatible testnet gRPC-web endpoint first");
  }

  // Viewing material is handled only in memory for the active checkout.
  // Do not send it to the gateway or persist it as application state.
  const viewingKey = (viewingKeyOverride ?? elements.viewingKey.value).trim();
  if (viewingKey.length === 0) {
    throw new Error("Enter your testnet view-only UFVK to verify shielded memos. Re-enter it whenever you reopen the wallet; never use a spending key.");
  }

  let browserWallet: WebZjsBrowserWallet | undefined;
  try {
    browserWallet = await WebZjsBrowserWallet.open({
      network: "test",
      lightwalletdUrl,
      storage: walletStorage,
      storageKey: "testnet:db"
    });
    let accountId = browserWallet.getAccountId();
    if (accountId === undefined) {
      const birthdayHeight = parseTestnetBirthday(
        elements.birthdayHeight.value
      );
      accountId = await browserWallet.createViewOnlyAccount({
        accountName: "checkout-testnet",
        ufvk: viewingKey,
        birthdayHeight
      });
    }

    // Current-consensus Sapling transaction parsing and trial decryption happen
    // in the browser's isolated WASM module. Missing evidence fails closed.
    const paymentHydrator = await loadTestnetPaymentHydrator(
      browserWallet,
      viewingKey
    );
    const recipientAddress = await browserWallet.getCurrentAddress();
    const sdk = await ZcashPaymentSessions.create({
      storage: testnetSessionStorage,
      recipientAddress,
      wallet: browserWallet,
      accountId,
      paymentHydrator,
      requiredConfirmations: 2
    });
    const controller = new CheckoutDemoController(sdk, testnetSessionStorage);
    await controller.restore();

    return {
      mode: "testnet",
      sdk,
      controller,
      simulationWallet: undefined,
      browserWallet,
      simulationClock: undefined,
      recipientAddress
    };
  } catch (error) {
    browserWallet?.close();
    throw error;
  } finally {
    // Clear the input even when WebZjs initialization fails before wallet creation.
    elements.viewingKey.value = "";
  }
}

async function initialize(): Promise<void> {
  // Parse URL search parameters for Storefront simulator integration
  try {
    const params = new URLSearchParams(window.location.search);
    const paramItem = params.get("item");
    const paramAmount = params.get("amount");
    const paramMemo = params.get("memo");

    if (paramAmount) elements.amountInput.value = paramAmount;
    if (paramMemo) elements.memoInput.value = paramMemo;

    const orderItemName = document.getElementById("order-item-name");
    if (orderItemName && paramItem) orderItemName.textContent = paramItem;

    const orderMemoBadge = document.getElementById("order-memo-badge");
    if (orderMemoBadge && paramMemo) orderMemoBadge.textContent = paramMemo;

    const orderAmountBadge = document.getElementById("order-amount-badge");
    if (orderAmountBadge && paramAmount) orderAmountBadge.textContent = `${paramAmount} ZEC`;
  } catch {
    // Ignore URL parsing errors
  }

  if (mode === "simulation") {
    runtime = await createSimulationRuntime();
  } else {
    runtime = undefined;
    elements.walletConnectionStatus.dataset.phase = "idle";
    elements.walletConnectionStatus.textContent =
      "Connect a view-only TESTNET wallet to create a real shielded payment request.";
    // Production static delivery of the wallet WASM is large. Begin the
    // isolated WebZjs worker startup while the merchant reads onboarding;
    // failures remain retryable through the explicit open action.
    void WebZjsBrowserWallet.prewarm().catch(() => undefined);
  }
  bindEvents();
  render();
  renderMerchantOnboarding();
  setupEditorialMotion();
}

// Archived evidence is not a fresh transaction or an SDK state transition.
function loadVerifiedProof(): void {
  window.open(
    "https://github.com/Iniwura/zcash-payment-sessions/blob/main/LIVE_TESTNET_PROOF.md",
    "_blank",
    "noopener,noreferrer"
  );
}

function bindEvents(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      void runScenario(button.dataset.scenario ?? "");
    });
  });

  document.getElementById("mode-simulation")?.addEventListener("click", () => {
    void selectMode("simulation");
  });
  document.getElementById("mode-testnet")?.addEventListener("click", () => {
    selectMode("testnet");
  });
  elements.openTestnet.addEventListener("click", () => void openTestnetWallet());
  elements.unlockProfileButton.addEventListener("click", () => void unlockMerchantWallet());
  elements.forgetProfileButton.addEventListener("click", () => {
    window.localStorage.removeItem(MERCHANT_PROFILE_KEY);
    elements.unlockPassphrase.value = "";
    elements.merchantAdvanced.open = true;
    renderMerchantOnboarding();
    elements.walletConnectionStatus.textContent = "Saved unlock profile removed. Existing wallet database and payment sessions were preserved.";
  });
  elements.createSession.addEventListener("click", () => void createSession());
  elements.guideRun.addEventListener("click", () => void runGuidedCheckout());
  elements.refreshStatus.addEventListener("click", () => void refreshStatus());
  elements.resetDemo.addEventListener("click", resetDemo);
  elements.copyUri.addEventListener("click", () => void copyUri());
  document.getElementById("copy-receipt")?.addEventListener("click", () => void copyReceipt());
  document.getElementById("print-receipt")?.addEventListener("click", () => {
    if (runtime?.controller.view.session?.status === "PAID") window.print();
  });
  elements.amountInput.addEventListener("input", updateCustomOrder);
  elements.memoInput.addEventListener("input", updateCustomOrder);
  document.getElementById("load-verified-proof")?.addEventListener("click", () => loadVerifiedProof());
  document.getElementById("load-verified-proof-2")?.addEventListener("click", () => loadVerifiedProof());

  const tour = new ProductTour();
  document.getElementById("nav-tour")?.addEventListener("click", (e) => {
    e.preventDefault();
    tour.start();
  });
  document.getElementById("hero-start-tour")?.addEventListener("click", () => {
    tour.start();
  });
  document.getElementById("app-tour-btn")?.addEventListener("click", () => {
    tour.start();
  });

  document.querySelectorAll<HTMLButtonElement>(".storefront-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const product = btn.dataset.product;
      document.querySelectorAll<HTMLElement>(".storefront-card").forEach((card) => {
        card.classList.toggle("is-selected", card.contains(btn));
      });
      document.querySelectorAll<HTMLButtonElement>(".storefront-btn").forEach((button) => {
        button.setAttribute("aria-pressed", String(button === btn));
      });
      const amount = btn.dataset.amount;
      const memo = btn.dataset.memo;
      if (amount) elements.amountInput.value = amount;
      if (memo) elements.memoInput.value = memo;
      const orderItem = document.getElementById("order-item-name");
      if (orderItem && product) orderItem.textContent = product;
      const orderMemo = document.getElementById("order-memo-badge");
      if (orderMemo && memo) orderMemo.textContent = memo;
      const orderAmt = document.getElementById("order-amount-badge");
      if (orderAmt && amount) orderAmt.textContent = `${amount} ZEC`;

      document.getElementById("checkout")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start"
      });

      if (mode === "simulation") {
        void createSession();
      }
    });
  });
}

function syncOrderBadges(): void {
  const amount = document.getElementById("order-amount-badge");
  const memo = document.getElementById("order-memo-badge");
  if (amount) amount.textContent = `${elements.amountInput.value.trim() || "—"} ZEC`;
  if (memo) memo.textContent = elements.memoInput.value.trim() || "—";
}

function updateCustomOrder(): void {
  document.querySelectorAll<HTMLElement>(".storefront-card").forEach((card) => {
    card.classList.remove("is-selected");
  });
  document.querySelectorAll<HTMLButtonElement>(".storefront-btn").forEach((button) => {
    button.setAttribute("aria-pressed", "false");
  });
  const orderItem = document.getElementById("order-item-name");
  if (orderItem) orderItem.textContent = "Custom payment request";
  syncOrderBadges();
}

async function unlockMerchantWallet(): Promise<void> {
  const passphrase = elements.unlockPassphrase.value;
  elements.unlockPassphrase.value = "";
  if (passphrase.length === 0) {
    showError("Enter the passphrase used to protect this merchant profile");
    return;
  }
  const ciphertext = window.localStorage.getItem(MERCHANT_PROFILE_KEY);
  if (ciphertext === null) {
    showError("No saved merchant profile was found");
    return;
  }
  elements.unlockProfileButton.disabled = true;
  try {
    const profile = await openMerchantProfile(ciphertext, passphrase);
    elements.lightwalletdUrl.value = profile.endpoint;
    if (profile.birthdayHeight !== undefined) elements.birthdayHeight.value = String(profile.birthdayHeight);
    await openTestnetWallet(profile.ufvk);
  } catch (error) {
    showError(error);
  } finally {
    elements.unlockProfileButton.disabled = false;
  }
}

async function selectMode(nextMode: DemoMode): Promise<void> {
  walletConnectionEpoch += 1;
  openingTestnetWallet = false;
  clearError();
  saveActiveMode(nextMode);
  if (nextMode === "simulation") {
    elements.guideRun.disabled = true;
    runtime?.browserWallet?.close();
    runtime = await createSimulationRuntime();
    mode = "simulation";
    elements.walletConnectionStatus.textContent = "";
    elements.walletConnectionStatus.dataset.phase = "idle";
    render();
    renderMerchantOnboarding();
    return;
  }

  if (!realTestnetMode.realTestnetEnabled) {
    render();
    return;
  }

  runtime?.browserWallet?.close();
  runtime = undefined;
  mode = "testnet";
  elements.walletConnectionStatus.dataset.phase = "idle";
  elements.walletConnectionStatus.textContent = "Connect a view-only testnet wallet before creating a real payment request.";
  render(null, undefined);
  renderMerchantOnboarding();
}

async function openTestnetWallet(viewingKeyOverride?: string): Promise<void> {
  if (openingTestnetWallet) return;
  clearError();
  if (!realTestnetMode.realTestnetEnabled) {
    render();
    return;
  }

  const passphrase = viewingKeyOverride === undefined ? elements.setupPassphrase.value : "";
  if (passphrase.length > 0 && passphrase.length < 12) {
    showError("Use at least 12 characters to save a reusable merchant profile");
    return;
  }
  const profileKey = viewingKeyOverride ?? elements.viewingKey.value.trim();
  const birthdayText = elements.birthdayHeight.value.trim();
  const profileBirthday = birthdayText === "" ? undefined : parseTestnetBirthday(birthdayText);
  const endpoint = elements.lightwalletdUrl.value.trim() || DEFAULT_TESTNET_GRPC_WEB_ENDPOINT;
  const epoch = ++walletConnectionEpoch;
  openingTestnetWallet = true;
  elements.openTestnet.disabled = true;
  elements.openTestnet.textContent = "Opening wallet…";
  elements.walletConnectionStatus.dataset.phase = "opening";
  elements.walletConnectionStatus.textContent = "Opening the WebZjs view-only wallet and local memo verifier. This may take a moment.";
  render();
  try {
    const next = await openTestnetRuntime(viewingKeyOverride);
    if (epoch !== walletConnectionEpoch || mode !== "testnet") {
      next.browserWallet?.close();
      return;
    }
    runtime = next;
    elements.walletConnectionStatus.dataset.phase = "ready";
    elements.walletConnectionStatus.textContent = "View-only testnet wallet ready. Create a real request, then refresh to scan the chain.";
    if (passphrase.length > 0) {
      try {
        const sealed = await sealMerchantProfile({
          ufvk: profileKey, endpoint,
          ...(profileBirthday === undefined ? {} : { birthdayHeight: profileBirthday })
        }, passphrase);
        window.localStorage.setItem(MERCHANT_PROFILE_KEY, sealed);
        elements.walletConnectionStatus.textContent = "Merchant wallet ready. Encrypted viewing profile saved for future unlocks.";
      } catch (error) {
        showError(error);
        elements.walletConnectionStatus.textContent = "Wallet is connected, but saving the encrypted profile failed.";
      }
    }
    elements.merchantAdvanced.open = false;
    render();
    renderMerchantOnboarding();
  } catch (error) {
    if (epoch === walletConnectionEpoch) {
      elements.walletConnectionStatus.dataset.phase = "error";
      elements.walletConnectionStatus.textContent = "Could not open the view-only wallet. Check the error and try again.";
      showError(error);
    }
  } finally {
    if (epoch === walletConnectionEpoch) {
      openingTestnetWallet = false;
      elements.openTestnet.disabled = false;
      elements.openTestnet.textContent = "Open view-only wallet ↗";
      elements.setupPassphrase.value = "";
      render();
      renderMerchantOnboarding();
    }
  }
}

async function createSession(): Promise<void> {
  if (runtime === undefined) return;
  clearError();

  try {
    const amountZatoshis = parseAmount(elements.amountInput.value);
    const state = await runtime.controller.createSession({
      amountZatoshis,
      memo: elements.memoInput.value,
      expiresInMs: 20 * 60 * 1000
    });
    if (runtime.simulationWallet !== undefined) {
      runtime.simulationWallet.payments = [];
    }
    render(state.session, state.observation);
    if (!guidedRunActive) {
      elements.guideStatus.textContent = "REQUEST READY · RUN THE GUIDE OR EXPLORE THE EDGE CASES";
      if (window.innerWidth < 900) {
        elements.qrFrame.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
      }
    }
  } catch (error) {
    showError(error);
  }
}

async function refreshStatus(): Promise<void> {
  if (runtime === undefined) return;
  clearError();
  elements.refreshStatus.disabled = true;
  const refreshLabel = elements.refreshStatus.innerHTML;
  elements.refreshStatus.textContent = runtime.browserWallet !== undefined ? "Scanning testnet…" : "Checking observations…";
  elements.refreshStatus.setAttribute("aria-busy", "true");

  try {
    if (runtime.browserWallet !== undefined) {
      await runtime.browserWallet.sync();
    }
    const state = await runtime.controller.refresh();
    render(state.session, state.observation);
    if (state.error !== undefined) showError(state.error);
  } catch (error) {
    showError(error);
  } finally {
    elements.refreshStatus.disabled = false;
    elements.refreshStatus.removeAttribute("aria-busy");
    elements.refreshStatus.innerHTML = refreshLabel;
  }
}

async function runGuidedCheckout(): Promise<void> {
  if (mode === "testnet") {
    if (runtime?.browserWallet !== undefined) {
      const previousId = runtime.controller.view.session?.id;
      await createSession();
      if (runtime.controller.view.session !== null &&
          runtime.controller.view.session.id !== previousId) {
        elements.guideStatus.textContent = "REAL PAYMENT REQUEST GENERATED · AWAITING CHAIN EVIDENCE";
        elements.qrFrame.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
          block: "center"
        });
      }
      return;
    }
    elements.realConfig.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
    if (hasStoredMerchantProfile()) {
      elements.unlockPassphrase.focus({ preventScroll: true });
    } else {
      elements.merchantAdvanced.open = true;
      elements.viewingKey.focus({ preventScroll: true });
    }
    return;
  }
  if (guidedRunActive || runtime?.simulationWallet === undefined) return;
  guidedRunActive = true;
  elements.guideRun.disabled = true;
  try {
    elements.guideStatus.textContent = "STEP 01 / PREPARING A FRESH REQUEST";
    await createSession();
    if (runtime?.controller.view.session?.status !== "AWAITING_PAYMENT") return;
    document.getElementById("timeline")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
    await new Promise<void>((resolve) => window.setTimeout(resolve, 650));
    const steps = [
      { scenario: "exact", label: "STEP 02 / EXACT OUTPUT DETECTED" },
      { scenario: "confirming", label: "STEP 03 / CONFIRMATIONS ACCUMULATING" },
      { scenario: "paid", label: "COMPLETE / PAID · REPLAY-SAFE SESSION" }
    ];
    for (const step of steps) {
      elements.guideStatus.textContent = step.label;
      await runScenario(step.scenario);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 900));
    }
  } catch (error) {
    showError(error);
    elements.guideStatus.textContent = "WALKTHROUGH INTERRUPTED · RETRY";
  } finally {
    guidedRunActive = false;
    elements.guideRun.disabled = mode !== "simulation";
  }
}

async function runScenario(scenario: string): Promise<void> {
  if (runtime?.simulationWallet === undefined || runtime.controller.view.session === null) {
    showError("Create a simulation session first");
    return;
  }

  const session = runtime.controller.view.session;
  const payment = {
    payment_id: `${session.id}:orchard:0`,
    txid: `demo-${session.id.slice(0, 8)}`,
    value: session.amountZatoshis,
    memo: session.memo,
    block_height: 2_000_000,
    confirmations: 0,
    status: 1,
    pool: "orchard"
  } as const;

  switch (scenario) {
    case "exact":
      runtime.simulationWallet.payments = [payment];
      break;
    case "confirming":
      runtime.simulationWallet.payments = [{ ...payment, confirmations: 1, status: 0 }];
      break;
    case "paid":
      runtime.simulationWallet.payments = [{ ...payment, confirmations: 2, status: 0 }];
      break;
    case "ambiguous":
      runtime.simulationWallet.payments = [
        payment,
        { ...payment, payment_id: `${session.id}:orchard:1`, txid: `${payment.txid}-b` }
      ];
      break;
    case "reorg":
      runtime.simulationWallet.payments = [{ ...payment, status: 3 }];
      break;
    case "expire":
      runtime.simulationClock?.expire();
      break;
    default:
      return;
  }

  await refreshStatus();
}

function resetDemo(): void {
  runtime?.browserWallet?.close();
  runtime = undefined;
  sessionStorage.removeItem("zcash-checkout-demo:active-session");
  mode = "simulation";
  saveActiveMode("simulation");
  elements.guideRun.disabled = true;
  void createSimulationRuntime().then((next) => {
    runtime = next;
    clearError();
    elements.guideStatus.textContent = "FRESH REQUEST READY · SIMULATION";
    render();
  });
}

async function copyUri(): Promise<void> {
  if (elements.uriDisplay.value.length === 0) return;
  await navigator.clipboard.writeText(elements.uriDisplay.value);
  elements.copyUri.textContent = "Copied";
  window.setTimeout(() => {
    elements.copyUri.textContent = "Copy";
  }, 1200);
}

function render(
  session: PublicPaymentSession | null = runtime?.controller.view.session ?? null,
  observation: PaymentObservationResult | undefined = runtime?.controller.view.observation
): void {
  const status = session?.status ?? "AWAITING_PAYMENT";
  const payment = observation?.payment;
  const statusLabel = session === null ? "READY" : status.replaceAll("_", " ");
  elements.sessionBadge.textContent = statusLabel;
  elements.sessionBadge.dataset.status = session?.status ?? "READY";
  const frame = document.querySelector<HTMLElement>(".checkout-frame");
  if (frame !== null) frame.dataset.sessionState = session?.status ?? "READY";
  const simulationModeButton = document.getElementById("mode-simulation");
  simulationModeButton?.classList.toggle("active", mode === "simulation");
  simulationModeButton?.setAttribute("aria-pressed", String(mode === "simulation"));
  elements.modeTestnet.classList.toggle("active", mode === "testnet");
  elements.modeTestnet.setAttribute("aria-pressed", String(mode === "testnet"));
  elements.modeBadge.textContent = mode === "simulation" ? "Demo simulation" : "Real testnet";
  elements.detailMode.textContent = mode === "simulation" ? "Demo simulation" : "Real testnet";
  elements.modeTestnet.disabled = !realTestnetMode.realTestnetEnabled;
  elements.realModeNotice.textContent = realTestnetMode.notice;
  elements.realModeNotice.classList.toggle("hidden", realTestnetMode.notice.length === 0);
  elements.amountDisplay.textContent = session === null ? "—" : formatZec(session.amountZatoshis);
  elements.recipientDisplay.textContent = session === null
    ? "Create a session to derive the payment request."
    : `Recipient · ${runtime?.recipientAddress ?? "configured wallet address"}`;
  elements.uriDisplay.value = session?.paymentUri ?? "";
  elements.createSession.disabled = openingTestnetWallet || runtime === undefined || runtime.mode !== mode;
  elements.refreshStatus.disabled = openingTestnetWallet || runtime === undefined || runtime.mode !== mode;
  elements.copyUri.disabled = session === null;
  elements.createSession.innerHTML = session === null
    ? 'Create payment session <span aria-hidden="true">↗</span>'
    : 'Create another request <span aria-hidden="true">↗</span>';
  elements.detailSession.textContent = session?.id ?? "—";
  elements.detailMemo.textContent = session?.memo ?? "—";
  elements.detailPayment.textContent = payment?.paymentId ?? "—";
  elements.detailTxid.textContent = payment?.txid ?? "—";
  elements.detailConfirmations.textContent = payment === undefined ? "—" : String(payment.confirmations);
  elements.detailPool.textContent = payment?.pool ?? "—";
  elements.detailExpiry.textContent = session === null ? "—" : new Date(session.expiresAtMs).toLocaleString();
  elements.lifecycleNote.textContent = session === null ? "Waiting for a session" : lifecycleNote(status);
  elements.realConfig.classList.toggle("hidden", mode !== "testnet");
  elements.simulationControls.classList.toggle("hidden", mode !== "simulation");
  const guideRunDisabled =
    guidedRunActive ||
    openingTestnetWallet ||
    (mode === "simulation" && (runtime === undefined || runtime.mode !== "simulation"));
  elements.guideRun.disabled = guideRunDisabled;
  if (!guidedRunActive) {
    elements.guideRun.innerHTML = mode === "testnet"
      ? (runtime?.browserWallet !== undefined
          ? 'Create real payment request <span aria-hidden="true">↗</span>'
          : hasStoredMerchantProfile()
            ? 'Unlock merchant wallet <span aria-hidden="true">↗</span>'
            : 'Connect merchant wallet <span aria-hidden="true">↗</span>')
      : 'Run the guided simulation <span aria-hidden="true">↗</span>';
    elements.guideStatus.textContent = mode === "testnet"
      ? "REAL TESTNET · VIEW-ONLY WALLET · NO SPENDING KEYS"
      : "SIMULATION · ZERO FUNDS TRANSFERRED";
  }

  if (session !== null) {
    elements.qrFrame.innerHTML = createPaymentQrSvg(session.paymentUri);
  } else {
    elements.qrFrame.innerHTML = '<div class="qr-empty"><span class="qr-mark">⌁</span><span>QR appears when a session is created</span></div>';
  }

  const qrState = document.getElementById("qr-instrument-state");
  if (qrState) qrState.textContent = session === null
    ? "AWAITING REQUEST"
    : status === "PAID"
      ? "REQUEST RECORDED / RECEIPT BELOW"
      : mode === "simulation"
        ? "SIMULATED REQUEST / NO FUNDS"
        : "TESTNET REQUEST / AWAITING PROOF";
  renderReceipt(session, observation);
  renderTimeline(session?.status);
  renderException(session?.status, observation);
  renderCountdown(session);
}

function renderReceipt(
  session: PublicPaymentSession | null,
  observation: PaymentObservationResult | undefined
): void {
  const panel = document.getElementById("receipt-panel");
  if (!panel) return;
  const payment = observation?.payment;
  const issued = session?.status === "PAID" && payment !== undefined;
  panel.classList.toggle("hidden", !issued);
  if (!issued || session === null || payment === undefined) return;

  const simulation = mode === "simulation";
  const details: Record<string, string> = {
    "receipt-mode": simulation ? "SIMULATED / SDK TEST" : "REAL ZCASH TESTNET",
    "receipt-amount": `${formatZec(session.amountZatoshis)} ZEC`,
    "receipt-confirmations": String(payment.confirmations),
    "receipt-session": session.id,
    "receipt-payment": payment.paymentId,
    "receipt-transaction": payment.txid,
    "receipt-memo": session.memo,
    "receipt-subtitle": simulation
      ? "The public SDK reached PAID using synthetic wallet observations. No funds were transferred."
      : "The public SDK reached PAID after observing the required testnet payment evidence.",
    "receipt-disclosure": simulation
      ? "DEVELOPER SIMULATION / NOT ON-CHAIN PAYMENT EVIDENCE"
      : "REAL TESTNET OBSERVATION / NOT A MAINNET RECEIPT"
  };
  for (const [id, value] of Object.entries(details)) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }
  panel.dataset.mode = simulation ? "simulation" : "testnet";
}

async function copyReceipt(): Promise<void> {
  const session = runtime?.controller.view.session;
  const payment = runtime?.controller.view.observation?.payment;
  if (session?.status !== "PAID" || payment === undefined) return;
  const simulation = mode === "simulation";
  const contents = [
    "ZPS / PAYMENT SESSION RECEIPT",
    simulation ? "DEVELOPER SIMULATION — NO FUNDS TRANSFERRED" : "REAL ZCASH TESTNET — NOT MAINNET",
    `Status: ${session.status}`,
    `Amount: ${formatZec(session.amountZatoshis)} ZEC`,
    `Session ID: ${session.id}`,
    `Payment ID: ${payment.paymentId}`,
    `Transaction: ${payment.txid}`,
    `Confirmations: ${payment.confirmations}`,
    `Correlation memo: ${session.memo}`
  ].join("\n");
  try {
    await navigator.clipboard.writeText(contents);
    const button = document.getElementById("copy-receipt");
    if (button) {
      button.textContent = "Receipt copied";
      window.setTimeout(() => { button.textContent = "Copy receipt ↗"; }, 1400);
    }
  } catch (error) {
    showError(error);
  }
}

function renderTimeline(status: PublicPaymentSession["status"] | undefined): void {
  const progress: Record<string, number> = {
    AWAITING_PAYMENT: 0,
    DETECTED: 1,
    CONFIRMING: 2,
    PAID: 3,
    REORGED: 1,
    AMBIGUOUS: 0,
    EXPIRED: 0
  };
  const current = status === undefined ? -1 : progress[status] ?? -1;
  elements.timeline.querySelectorAll<HTMLElement>("[data-timeline]").forEach((item, index) => {
    const itemStatus = item.dataset.timeline ?? "";
    item.classList.toggle("complete", current > index || status === "PAID");
    item.classList.toggle("current", itemStatus === status);
  });
}

function renderException(
  status: PublicPaymentSession["status"] | undefined,
  observation: PaymentObservationResult | undefined
): void {
  const text = describeSessionException(status, observation);
  elements.exceptionState.textContent = text;
  elements.exceptionState.classList.toggle("hidden", text.length === 0);
}

function renderCountdown(session: PublicPaymentSession | null): void {
  if (session === null) {
    elements.countdown.textContent = "—";
    return;
  }

  const now = runtime?.simulationClock?.now() ?? Date.now();
  const remaining = Math.max(0, session.expiresAtMs - now);
  if (remaining === 0) {
    elements.countdown.textContent = "Expired";
    return;
  }

  const totalSeconds = Math.ceil(remaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  elements.countdown.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function lifecycleNote(status: PublicPaymentSession["status"]): string {
  switch (status) {
    case "AWAITING_PAYMENT": return "Listening for an exact output";
    case "DETECTED": return "Output matched; waiting for mining";
    case "CONFIRMING": return "Confirmations are accumulating";
    case "PAID": return "Payment is final for this session";
    case "REORGED": return "Waiting for re-observation";
    case "AMBIGUOUS": return "Manual disambiguation required";
    case "EXPIRED": return "No further matches accepted";
  }
}

function setupEditorialMotion(): void {
  if (
    !("IntersectionObserver" in window) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) return;

  const sections = document.querySelectorAll<HTMLElement>(
    ".step, .invariant, .section-topline, .proof-main, .developer-grid"
  );
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement;
      element.classList.remove("will-reveal");
      element.classList.add("is-revealed");
      observer.unobserve(element);
    }
  }, { threshold: 0.07, rootMargin: "0px 0px -5% 0px" });

  for (const section of sections) {
    section.classList.add("will-reveal");
    observer.observe(section);
  }
}

function parseAmount(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(normalized)) {
    throw new Error("Amount must be a positive ZEC value with up to 8 decimals");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const zatoshis = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, "0"));
  if (zatoshis <= 0n) throw new Error("Amount must be greater than zero");
  return zatoshis;
}

function formatZec(zatoshis: bigint): string {
  const whole = zatoshis / 100_000_000n;
  const fraction = String(zatoshis % 100_000_000n).padStart(8, "0");
  return `${whole}.${fraction}`;
}

function clearError(): void {
  elements.errorMessage.textContent = "";
}

function showError(error: unknown): void {
  elements.errorMessage.textContent = error instanceof Error ? error.message : String(error);
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing checkout element: ${id}`);
  return element as T;
}

void initialize().catch(showError);
window.setInterval(() => renderCountdown(runtime?.controller.view.session ?? null), 1000);
