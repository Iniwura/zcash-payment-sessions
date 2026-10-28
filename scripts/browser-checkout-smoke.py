#!/usr/bin/env python3
"""Browser acceptance for the real public SDK-backed simulation checkout.

Launches system Chrome against Vite preview; never uses spending keys, funds,
remote chain endpoints or a mock UI state machine.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = "http://127.0.0.1:4173/checkout.html"
OUT = Path("visual-audit")
OUT.mkdir(exist_ok=True)
BROWSER_BIN = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
if BROWSER_BIN is None:
    raise SystemExit("Chrome/Chromium is required for browser acceptance")


def acceptance(browser, width: int, height: int) -> None:
    context = browser.new_context(
        viewport={"width": width, "height": height},
        reduced_motion="reduce",
    )
    page = context.new_page()
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    status = page.locator("#session-badge")

    try:
        response = page.goto(BASE, wait_until="domcontentloaded", timeout=30000)
        assert response is not None and response.status == 200

        if page.locator("#mode-badge").inner_text() != "Demo simulation":
            page.locator("#mode-simulation").click()
        expect(page.locator("#mode-badge")).to_have_text("Demo simulation", timeout=15000)
        
        # The sample request comes from the public SDK and WASM ZIP-321 generator.
        expect(status).to_have_text("AWAITING PAYMENT", timeout=30000)
        expect(page.locator("#qr-frame svg")).to_have_count(1, timeout=15000)
        assert page.locator("#uri-display").input_value().startswith("zcash:")
        assert page.locator("#mode-badge").inner_text() == "Demo simulation"
        expect(page.locator("#guide-run")).to_be_enabled(timeout=15000)
        expect(page.locator("#receipt-panel")).to_be_hidden()
        assert page.locator("#qr-frame svg").count() == 1
        assert "⚡" not in page.locator("body").inner_text()
        assert "☕" not in page.locator("body").inner_text()
        assert "🛡" not in page.locator("body").inner_text()
        page.locator("#app-tour-btn").click()
        expect(page.locator(".tour-card")).to_be_visible()
        expect(page.locator(".tour-card .tour-badge")).to_contain_text("01 / 06")
        for expected in ("02 / 06", "03 / 06", "04 / 06", "05 / 06", "06 / 06"):
            page.locator(".tour-card .next-btn").click()
            expect(page.locator(".tour-card .tour-badge")).to_contain_text(expected)
        page.locator(".tour-card .next-btn").click()
        expect(page.locator(".tour-card")).to_have_count(0)
        assert page.evaluate("window.crossOriginIsolated") is True
        if width < 900:
            doc_width = page.evaluate("document.documentElement.scrollWidth")
            if doc_width > width + 2:
                offenders = page.evaluate("""() => [...document.querySelectorAll('body *')]
                  .filter(el => {
                    const box = el.getBoundingClientRect();
                    const style = getComputedStyle(el);
                    return style.display !== 'none' &&
                      (box.right > innerWidth + 2 || box.left < -2);
                  })
                  .slice(0, 12)
                  .map(el => ({
                    tag: el.tagName, id: el.id, className: String(el.className).slice(0, 90),
                    right: Math.round(el.getBoundingClientRect().right),
                    width: Math.round(el.getBoundingClientRect().width)
                  }))""")
                print("MOBILE_OVERFLOW_OFFENDERS:", offenders)
            assert doc_width <= width + 2, f"Horizontal overflow: {doc_width}px at {width}px"

        page.evaluate("document.activeElement.blur()")
        page.screenshot(
            path=str(OUT / f"landing-{width}.png"), animations="disabled", timeout=30000
        )
        page.locator("#checkout").screenshot(
            path=str(OUT / f"checkout-{width}.png"), animations="disabled", timeout=30000
        )
        page.locator("#guide-run").click()
        expect(status).to_have_text("PAID", timeout=20000)
        expect(page.locator("#detail-confirmations")).to_have_text("2")
        expect(page.locator("#receipt-panel")).to_be_visible()
        expect(page.locator("#receipt-mode")).to_have_text("SIMULATED / SDK TEST")
        expect(page.locator("#receipt-disclosure")).to_contain_text("NOT ON-CHAIN")
        expect(page.locator("#receipt-amount")).to_contain_text("ZEC")
        expect(page.locator("#receipt-transaction")).to_contain_text("demo-")
        expect(page.locator("#copy-receipt")).to_be_enabled()
        expect(page.locator("#print-receipt")).to_be_enabled()
        assert "COMPLETE" in page.locator("#guide-status").inner_text()
        session_id = page.locator("#detail-session").inner_text()

        page.reload(wait_until="domcontentloaded")
        expect(status).to_have_text("PAID", timeout=30000)
        assert page.locator("#detail-session").inner_text() == session_id

        # Reorg after a confirmed simulated payment must be visibly reported.
        page.locator("#simulation-controls summary").click()
        page.locator('[data-scenario="reorg"]').click()
        expect(status).to_have_text("REORGED", timeout=15000)

        page.locator("#reset-demo").click()
        expect(status).to_have_text("AWAITING PAYMENT", timeout=30000)
        expect(page.locator("#receipt-panel")).to_be_hidden()
        expect(page.locator("#qr-frame svg")).to_have_count(1)
        if page.locator("#simulation-controls").get_attribute("open") is None:
            page.locator("#simulation-controls summary").click()
        page.locator('[data-scenario="ambiguous"]').click()
        expect(page.locator("#exception-state")).to_contain_text("Ambiguous", timeout=15000)
        expect(status).to_have_text("AWAITING PAYMENT")

        if errors:
            raise AssertionError(f"Uncaught browser errors: {errors}")
        print(f"PASS: {width}x{height} ready request, ZIP-321 QR, PAID, persistence, reorg, ambiguity")
    except Exception as exc:
        print(f"ACCEPTANCE_FAILED at {width}x{height}: {exc}")
        try:
            print("DIAG_MODE_BADGE:", repr(page.locator("#mode-badge").inner_text()))
            print("DIAG_SESSION_BADGE:", repr(status.inner_text()))
            print("DIAG_GUIDE_STATUS:", repr(page.locator("#guide-status").inner_text()))
            print("DIAG_ERROR_MSG:", repr(page.locator("#error-message").inner_text()))
        except Exception:
            pass
        if errors:
            print("DIAG_PAGE_ERRORS:", errors)
        raise
    finally:
        context.close()


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=BROWSER_BIN,
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    )
    try:
        acceptance(browser, 1440, 900)
        acceptance(browser, 390, 844)
    finally:
        browser.close()
