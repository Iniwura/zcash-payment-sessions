#!/usr/bin/env python3
"""Fast source-level responsive check, independent of the WebZjs/Rust build.
Loads checkout HTML and source CSS in Chromium without executing the wallet.
This is a layout diagnostic, not a real-wallet/browser integration acceptance.
"""
import shutil
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "examples/checkout/checkout.html").read_text()
CSS = (ROOT / "examples/checkout/src/style.css").read_text()

browser_bin = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
if not browser_bin:
    raise SystemExit("Chrome/Chromium is required for responsive audit")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=browser_bin, headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"])
    for width, height in [(320, 700), (360, 800), (390, 844), (1440, 900)]:
        for mode in ("real", "simulation"):
            page = browser.new_page(viewport={"width": width, "height": height},
                                    reduced_motion="reduce")
            page.set_content(HTML, wait_until="domcontentloaded")
            page.add_style_tag(content=CSS)
            if mode == "simulation":
                page.locator("#real-config").evaluate("(el) => el.classList.add('hidden')")
                page.locator("#simulation-controls").evaluate("(el) => el.classList.remove('hidden')")
            else:
                page.locator("#real-config").evaluate("(el) => el.classList.remove('hidden')")
                page.locator("#simulation-controls").evaluate("(el) => el.classList.add('hidden')")
            result = page.evaluate("""() => {
                const width = document.documentElement.scrollWidth;
                const offenders = [...document.querySelectorAll('body *')]
                  .filter(el => {
                    const box = el.getBoundingClientRect();
                    const style = getComputedStyle(el);
                    return style.display !== 'none' &&
                      (box.right > innerWidth + 2 || box.left < -2) &&
                      box.width > 0;
                  })
                  .slice(0, 12)
                  .map(el => ({
                    tag: el.tagName, id: el.id,
                    className: typeof el.className === 'string' ? el.className.slice(0, 70) : '',
                    right: Math.round(el.getBoundingClientRect().right),
                    left: Math.round(el.getBoundingClientRect().left)
                  }));
                return {width, offenders};
            }""")
            print(f"LAYOUT {width}x{height} mode={mode} scrollWidth={result['width']} offenders={result['offenders']}")
            assert result["width"] <= width + 2, f"Mobile overflow {width} mode {mode}"
            page.close()
    browser.close()
print("PASS: checkout source layout at 320/360/390/1440px, both modes")
