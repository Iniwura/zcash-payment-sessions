import {
  WebZjsBrowserWallet,
  ZcashPaymentSessions,
  type KeyValueStorage,
  type PaymentObservationResult,
  type PublicPaymentSession
} from "zcash-payment-sessions";
import { CheckoutDemoController } from "./controller.js";
import { createPaymentQrSvg } from "./qr.js";
import { describeSessionException } from "./ui-state.js";
import { SimulatedWallet } from "./simulated-wallet.js";
import { getRealTestnetModeAvailability } from "./runtime-capabilities.js";
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
  realModeNotice: required<HTMLElement>("real-mode-notice"),
  realConfig: required<HTMLElement>("real-config"),
  simulationControls: required<HTMLElement>("simulation-controls"),
  amountInput: required<HTMLInputElement>("amount-input"),
  memoInput: required<HTMLInputElement>("memo-input"),
  lightwalletdUrl: required<HTMLInputElement>("lightwalletd-url"),
  viewingKey: required<HTMLInputElement>("viewing-key"),
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

let runtime: Runtime | undefined;
let mode: DemoMode = "simulation";
const realTestnetMode = getRealTestnetModeAvailability(window.crossOriginIsolated);

const sessionStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(`checkout:${key}`),
  setItem: (key, value) => window.localStorage.setItem(`checkout:${key}`, value),
  removeItem: (key) => window.localStorage.removeItem(`checkout:${key}`)
};

// Keep reviewer simulation state separate from real chain observation state.
// A simulated checkout must never be restored into a view-only testnet wallet.
const testnetSessionStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(`checkout:testnet:${key}`),
  setItem: (key, value) => window.localStorage.setItem(`checkout:testnet:${key}`, value),
  removeItem: (key) => window.localStorage.removeItem(`checkout:testnet:${key}`)
};

const walletStorage: KeyValueStorage = {
  getItem: (key) => window.localStorage.getItem(`wallet:${key}`),
  setItem: (key, value) => window.localStorage.setItem(`wallet:${key}`, value),
  removeItem: (key) => window.localStorage.removeItem(`wallet:${key}`)
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

async function openTestnetRuntime(): Promise<Runtime> {
  const lightwalletdUrl =
    elements.lightwalletdUrl.value.trim() ||
    DEFAULT_TESTNET_GRPC_WEB_ENDPOINT;
  if (lightwalletdUrl.length === 0) {
    throw new Error("Enter a verified browser-compatible testnet gRPC-web endpoint first");
  }

  const browserWallet = await WebZjsBrowserWallet.open({
    network: "test",
    lightwalletdUrl,
    storage: walletStorage,
    storageKey: "testnet:db"
  });

  try {
    let accountId = browserWallet.getAccountId();
    if (accountId === undefined) {
      const viewingKey = elements.viewingKey.value;
      if (viewingKey.trim().length === 0) {
        throw new Error("Enter a testnet UFVK once to create the view-only account");
      }

      const birthdayHeight = parseTestnetBirthday(
        elements.birthdayHeight.value
      );
      accountId = await browserWallet.createViewOnlyAccount({
        accountName: "checkout-testnet",
        ufvk: viewingKey,
        birthdayHeight
      });
      elements.viewingKey.value = "";
    }

    const recipientAddress = await browserWallet.getCurrentAddress();
    const sdk = await ZcashPaymentSessions.create({
      storage: testnetSessionStorage,
      recipientAddress,
      wallet: browserWallet,
      accountId,
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
    browserWallet.close();
    throw error;
  }
}

async function initialize(): Promise<void> {
  runtime = await createSimulationRuntime();
  bindEvents();
  render();
  setupEditorialMotion();
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
  elements.createSession.addEventListener("click", () => void createSession());
  elements.refreshStatus.addEventListener("click", () => void refreshStatus());
  elements.resetDemo.addEventListener("click", resetDemo);
  elements.copyUri.addEventListener("click", () => void copyUri());
}

async function selectMode(nextMode: DemoMode): Promise<void> {
  clearError();
  if (nextMode === "simulation") {
    runtime?.browserWallet?.close();
    runtime = await createSimulationRuntime();
    mode = "simulation";
    render();
    return;
  }

  if (!realTestnetMode.realTestnetEnabled) {
    render();
    return;
  }

  runtime?.browserWallet?.close();
  runtime = undefined;
  mode = "testnet";
  render(null, undefined);
}

async function openTestnetWallet(): Promise<void> {
  clearError();
  if (!realTestnetMode.realTestnetEnabled) {
    render();
    return;
  }

  try {
    elements.openTestnet.disabled = true;
    runtime = await openTestnetRuntime();
    mode = "testnet";
    render();
  } catch (error) {
    showError(error);
  } finally {
    elements.openTestnet.disabled = false;
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
  } catch (error) {
    showError(error);
  }
}

async function refreshStatus(): Promise<void> {
  if (runtime === undefined) return;
  clearError();
  elements.refreshStatus.disabled = true;

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
  void createSimulationRuntime().then((next) => {
    runtime = next;
    clearError();
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
  elements.copyUri.disabled = session === null;
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

  if (session !== null) {
    elements.qrFrame.innerHTML = createPaymentQrSvg(session.paymentUri);
  } else {
    elements.qrFrame.innerHTML = '<div class="qr-empty"><span class="qr-mark">⌁</span><span>QR appears when a session is created</span></div>';
  }

  renderTimeline(session?.status);
  renderException(session?.status, observation);
  renderCountdown(session);
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
