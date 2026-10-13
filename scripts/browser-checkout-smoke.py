#!/usr/bin/env python3
"""Browser acceptance for the real public SDK-backed simulation checkout.

Launches system Chrome against Vite preview; never uses spending keys, funds,
remote chain endpoints or a mock UI state machine.
"""
from __future__ import annotations

import shutil
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE = "http://127.0.0.1:4173/"
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
    response = page.goto(BASE, wait_until="domcontentloaded", timeout=30000)
    assert response is not None and response.status == 200

    status = page.locator("#session-badge")
    # The sample request comes from the public SDK and WASM ZIP-321 generator.
    expect(status).to_have_text("AWAITING PAYMENT", timeout=30000)
    expect(page.locator("#qr-frame svg")).to_have_count(1, timeout=15000)
    assert page.locator("#uri-display").input_value().startswith("zcash:")
    assert page.locator("#mode-badge").inner_text() == "Demo simulation"
    assert page.locator("#guide-run").is_enabled()
    assert page.evaluate("window.crossOriginIsolated") is True
    if width < 900:
        doc_width = page.evaluate("document.documentElement.scrollWidth")
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
    expect(page.locator("#qr-frame svg")).to_have_count(1)
    if page.locator("#simulation-controls").get_attribute("open") is None:
        page.locator("#simulation-controls summary").click()
    page.locator('[data-scenario="ambiguous"]').click()
    expect(page.locator("#exception-state")).to_contain_text("Ambiguous", timeout=15000)
    expect(status).to_have_text("AWAITING PAYMENT")

    if errors:
        raise AssertionError(f"Uncaught browser errors: {errors}")
    print(f"PASS: {width}x{height} ready request, ZIP-321 QR, PAID, persistence, reorg, ambiguity")
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
