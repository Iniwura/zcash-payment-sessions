export interface TourStep {
  title: string;
  stepNumber: string;
  targetId: string;
  description: string;
  highlightText?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    stepNumber: "01 / 04",
    title: "SELECT A STOREFRONT ITEM",
    targetId: "app-storefront",
    description:
      "Choose a pre-configured merchant product (Coffee, VPN, Node Grant) to test an exact-correlation payment session with a unique satoshi value and memo.",
    highlightText: "INSTANT E-COMMERCE CONTEXT"
  },
  {
    stepNumber: "02 / 04",
    title: "THE ZIP-321 PAYMENT REQUEST",
    targetId: "qr-frame",
    description:
      "ZPS generates a standards-compliant ZIP-321 URI and scannable QR code. The request is bound to the exact order memo and amount.",
    highlightText: "STANDARDS-COMPLIANT URI"
  },
  {
    stepNumber: "03 / 04",
    title: "STATE MACHINE & REPLAY LEDGER",
    targetId: "timeline",
    description:
      "The payment progresses through verified states: Awaiting Payment → Detected → Confirming → Paid. Reorgs and timeouts are handled deterministically.",
    highlightText: "NO DOUBLE CREDIT GUARANTEE"
  },
  {
    stepNumber: "04 / 04",
    title: "BROWSER WASM & LIVE GATEWAY",
    targetId: "controls-panel",
    description:
      "Client-side Rust WebAssembly trial-decrypts private Sapling memos in your browser without spending keys, streaming live testnet blocks via our public Render Envoy gateway.",
    highlightText: "VIEW-ONLY PRIVACY PRESERVING"
  }
];

export class ProductTour {
  private currentStepIndex = 0;
  private overlay: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private activeTarget: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private steps: TourStep[] = TOUR_STEPS) {}

  public start(): void {
    this.currentStepIndex = 0;
    this.createDom();
    this.renderStep();
  }

  public next(): void {
    if (this.currentStepIndex < this.steps.length - 1) {
      this.currentStepIndex++;
      this.renderStep();
    } else {
      this.close();
    }
  }

  public prev(): void {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      this.renderStep();
    }
  }

  public close(): void {
    if (this.activeTarget) {
      this.activeTarget.classList.remove("tour-target-highlight");
      this.activeTarget = null;
    }
    if (this.keydownHandler) {
      window.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    this.overlay?.remove();
    this.card?.remove();
    this.overlay = null;
    this.card = null;
  }

  private createDom(): void {
    this.close();

    this.overlay = document.createElement("div");
    this.overlay.className = "tour-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    this.overlay.addEventListener("click", () => this.close());

    this.card = document.createElement("div");
    this.card.className = "tour-card";
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-modal", "true");
    this.card.setAttribute("aria-label", "ZPS Product Walkthrough");

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.card);

    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") this.close();
      if (e.key === "ArrowRight") this.next();
      if (e.key === "ArrowLeft") this.prev();
    };
    window.addEventListener("keydown", this.keydownHandler);
  }

  private renderStep(): void {
    const step = this.steps[this.currentStepIndex];
    if (!step || !this.card) return;

    if (this.activeTarget) {
      this.activeTarget.classList.remove("tour-target-highlight");
    }

    const target = document.getElementById(step.targetId);
    if (target) {
      this.activeTarget = target;
      target.classList.add("tour-target-highlight");
      target.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "center"
      });
    }

    const isFirst = this.currentStepIndex === 0;
    const isLast = this.currentStepIndex === this.steps.length - 1;

    this.card.innerHTML = `
      <div class="tour-header mono">
        <span class="tour-badge">${step.stepNumber}</span>
        <span class="tour-step-title">${step.title}</span>
        <button class="tour-close-btn" type="button" aria-label="Close tour">×</button>
      </div>
      <div class="tour-body">
        <p class="tour-description">${step.description}</p>
        ${
          step.highlightText
            ? `<div class="tour-highlight-tag mono">${step.highlightText}</div>`
            : ""
        }
      </div>
      <div class="tour-footer">
        <div class="tour-dots" aria-hidden="true">
          ${this.steps
            .map(
              (_, i) =>
                `<span class="tour-dot ${
                  i === this.currentStepIndex ? "active" : ""
                }"></span>`
            )
            .join("")}
        </div>
        <div class="tour-actions">
          <button class="tour-nav-btn prev-btn mono" type="button" ${
            isFirst ? "disabled" : ""
          }>← PREV</button>
          <button class="tour-nav-btn next-btn mono" type="button">
            ${isLast ? "FINISH TOUR ✓" : "NEXT →"}
          </button>
        </div>
      </div>
    `;

    this.card
      .querySelector(".tour-close-btn")
      ?.addEventListener("click", () => this.close());
    this.card
      .querySelector(".prev-btn")
      ?.addEventListener("click", () => this.prev());
    this.card
      .querySelector(".next-btn")
      ?.addEventListener("click", () => this.next());
  }
}
