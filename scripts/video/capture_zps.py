#!/usr/bin/env python3
"""Record real ZPS Vercel interactions for judge demo. Never supplies a wallet key or sends money."""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

OUT = Path("demo-capture")
OUT.mkdir(exist_ok=True)
ROOT = "https://zcash-payment-sessions.vercel.app"
CHROME = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
if not CHROME:
    raise RuntimeError("Chrome/Chromium missing")

def pause(page, seconds=2):
    page.wait_for_timeout(round(seconds*1000))

def frame(page, selector, timeout=10000):
    page.locator(selector).scroll_into_view_if_needed(timeout=timeout)
    pause(page, 1)

def start(browser):
    return browser.new_context(
        viewport={"width": 1600, "height": 900},
        screen={"width": 1600, "height": 900},
        device_scale_factor=1,
        reduced_motion="reduce",
        record_video_dir=str(OUT),
        record_video_size={"width":1600,"height":900},
        color_scheme="light",
    )

def finish(context, page, label, report):
    video=page.video
    context.close()
    original=Path(video.path())
    dest=OUT/(label+".webm")
    original.rename(dest)
    report[label]={"file":str(dest),"bytes":dest.stat().st_size}

def main():
    report={}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=CHROME,headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"])
        # 01 — Real production landing, natural scroll and artwork.
        ctx=start(browser); pg=ctx.new_page()
        r=pg.goto(ROOT+"/",wait_until="domcontentloaded",timeout=45000)
        assert r and r.status==200
        pause(pg, 2.5)
        pg.screenshot(path=str(OUT/"landing.png"))
        pg.mouse.wheel(0,570); pause(pg,2.3)
        pg.mouse.wheel(0,620); pause(pg,2.3)
        pg.mouse.wheel(0,-1050); pause(pg,1.5)
        finish(ctx,pg,"01-product-landing",report)

        # 02 — Genuine live checkout and sample order, synthetic payment mode is visibly marked.
        ctx=start(browser);pg=ctx.new_page()
        r=pg.goto(ROOT+"/checkout",wait_until="domcontentloaded",timeout=45000)
        assert r and r.status==200
        expect(pg.locator("#mode-simulation")).to_be_visible(timeout=15000)
        pause(pg,1.5)
        pg.locator("#mode-simulation").click()
        expect(pg.locator("#mode-badge")).to_have_text("Demo simulation",timeout=20000)
        expect(pg.locator("#qr-frame svg")).to_have_count(1,timeout=20000)
        pg.screenshot(path=str(OUT/"simulation-request.png"))
        frame(pg,"#app-storefront")
        pause(pg,2)
        cards=pg.locator(".storefront-btn")
        if cards.count()>=2:
            cards.nth(1).click();pause(pg,2.3)
        frame(pg,"#checkout")
        pause(pg,2)
        frame(pg,"#qr-stage");pause(pg,3.5)
        pg.screenshot(path=str(OUT/"qr-instrument.png"))
        frame(pg,"#mode-switch");pause(pg,1.2)
        finish(ctx,pg,"02-request-qr",report)

        # 03 — SDK simulated lifecycle and receipt. No funded payment.
        ctx=start(browser);pg=ctx.new_page()
        r=pg.goto(ROOT+"/checkout",wait_until="domcontentloaded",timeout=45000)
        assert r and r.status==200
        pg.locator("#mode-simulation").click()
        expect(pg.locator("#guide-run")).to_be_enabled(timeout=20000)
        expect(pg.locator("#qr-frame svg")).to_have_count(1,timeout=15000)
        frame(pg,"#guide-run")
        pause(pg,1.2)
        pg.locator("#guide-run").click()
        expect(pg.locator("#session-badge")).to_have_text("PAID",timeout=25000)
        expect(pg.locator("#receipt-panel")).to_be_visible(timeout=15000)
        pause(pg,1.2)
        frame(pg,"#timeline-card");pause(pg,2)
        frame(pg,"#details-card");pause(pg,2.5)
        frame(pg,"#receipt-panel");pause(pg,4)
        pg.screenshot(path=str(OUT/"simulation-receipt.png"))
        pg.evaluate("window.scrollBy({top:-400,behavior:'instant'})")
        pause(pg,2)
        finish(ctx,pg,"03-simulation-lifecycle-receipt",report)

        # 04 — Real testnet onboarding is real browser mode, no secret, no funds.
        ctx=start(browser);pg=ctx.new_page()
        r=pg.goto(ROOT+"/checkout",wait_until="domcontentloaded",timeout=45000)
        assert r and r.status==200
        expect(pg.locator("#mode-testnet")).to_be_enabled(timeout=12000)
        pg.locator("#mode-testnet").click()
        expect(pg.locator("#mode-badge")).to_have_text("Real testnet",timeout=20000)
        pause(pg,1.5)
        frame(pg,"#mode-switch");pause(pg,1.5)
        frame(pg,"#merchant-advanced");pause(pg,2.5)
        pg.screenshot(path=str(OUT/"real-testnet-onboarding.png"))
        # Viewing key is NEVER entered; no testnet payment claim is manufactured.
        finish(ctx,pg,"04-real-testnet-view-only",report)

        # 05 — actual source proof, visible transaction evidence, not a simulated receipt.
        ctx=start(browser);pg=ctx.new_page()
        r=pg.goto("https://github.com/Iniwura/zcash-payment-sessions/blob/main/LIVE_TESTNET_PROOF.md",
                  wait_until="domcontentloaded",timeout=45000)
        assert r and r.status==200
        pause(pg,2.5)
        pg.screenshot(path=str(OUT/"historical-proof.png"))
        pg.mouse.wheel(0,570);pause(pg,2.6)
        pg.mouse.wheel(0,600);pause(pg,3)
        pg.mouse.wheel(0,-450);pause(pg,1)
        finish(ctx,pg,"05-historical-onchain-proof",report)

        # 06 — public SDK file, inspect real code without fabricating states.
        ctx=start(browser);pg=ctx.new_page()
        r=pg.goto("https://github.com/Iniwura/zcash-payment-sessions/blob/main/src/index.ts",
                  wait_until="domcontentloaded",timeout=45000)
        assert r and r.status==200
        pause(pg,2)
        pg.mouse.wheel(0,590);pause(pg,2.6)
        pg.mouse.wheel(0,500);pause(pg,2.5)
        finish(ctx,pg,"06-sdk-implementation",report)
        browser.close()
    (OUT/"capture-report.json").write_text(json.dumps(report,indent=2))
    print("CAPTURE_OK",json.dumps(report))

if __name__=="__main__":
    main()
