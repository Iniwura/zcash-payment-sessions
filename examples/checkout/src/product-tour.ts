export interface TourStep {
  title: string;
  stepNumber: string;
  targetId: string;
  description: string;
  highlightText?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    stepNumber: "01 / 06",
    title: "Start with an order",
    targetId: "app-storefront",
    description: "Choose a sample order or enter your own amount and memo. Each request belongs to one payment session. These sample items are examples, not a live store.",
    highlightText: "THE ORDER DEFINES WHAT TO EXPECT"
  },
  {
    stepNumber: "02 / 06",
    title: "Choose your evidence source",
    targetId: "mode-switch",
    description: "Real testnet uses a merchant's view-only wallet to observe the chain. Developer simulation runs the same public SDK with synthetic observations. The two modes never share payment evidence.",
    highlightText: "TESTNET AND SIMULATION STAY SEPARATE"
  },
  {
    stepNumber: "03 / 06",
    title: "Prepare the merchant wallet",
    targetId: "real-config",
    description: "Only the merchant connects a view-only testnet wallet. Customers never need a viewing key. Returning merchants can unlock an encrypted local profile.",
    highlightText: "VIEW-ONLY / NO SPENDING KEYS"
  },
  {
    stepNumber: "04 / 06",
    title: "A request becomes an instrument",
    targetId: "qr-stage",
    description: "ZPS creates a ZIP-321 payment URI with the recipient, amount and correlation memo. The QR code itself stays unaltered so a compatible wallet can scan it.",
    highlightText: "THE QR IS A REQUEST, NOT PROOF OF PAYMENT"
  },
  {
    stepNumber: "05 / 06",
    title: "Observe before crediting",
    targetId: "timeline-card",
    description: "Refresh to evaluate exact observations, confirmation depth, expiration and reorganization evidence. A payment is credited only after the SDK confirms the required evidence.",
    highlightText: "AWAITING / DETECTED / CONFIRMING / PAID"
  },
  {
    stepNumber: "06 / 06",
    title: "Inspect the receipt and audit trail",
    targetId: "details-card",
    description: "Once a session reaches PAID, ZPS creates a printable evidence receipt below the audit trail. Simulation receipts are explicitly marked; historical real-payment proof is linked separately.",
    highlightText: "RECEIPT ONLY AFTER VERIFIED PAID STATE"
  }
];

export class ProductTour {
  private currentStepIndex = 0;
  private overlay: HTMLElement | null = null;
  private card: HTMLElement | null = null;
  private activeTarget: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private previouslyFocused: HTMLElement | null = null;

  constructor(private steps: TourStep[] = TOUR_STEPS) {}

  public start(): void {
    this.currentStepIndex = 0;
    if (this.overlay !== null) this.close();
    this.previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
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
    const focusTarget = this.previouslyFocused;
    this.previouslyFocused = null;
    focusTarget?.focus({ preventScroll: true });
  }

  private createDom(): void {
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
      if (e.key === "Tab") this.trapFocus(e);
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
      <div class="tour-track" aria-hidden="true"><span style="width:${((this.currentStepIndex + 1) / this.steps.length) * 100}%"></span></div>\n      <div class="tour-footer">
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
            ${isLast ? "FINISH TOUR ↗" : "NEXT →"}
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

    (this.card.querySelector(".tour-close-btn") as HTMLElement | null)?.focus({
      preventScroll: true
    });
  }

  private trapFocus(event: KeyboardEvent): void {
    if (this.card === null) return;

    const focusable = [...this.card.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])"
    )];
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
