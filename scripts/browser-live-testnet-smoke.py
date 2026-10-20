#!/usr/bin/env python3
"""Real browser smoke against a public Zcash TESTNET RPC gateway.

An ephemeral testnet-only UFVK is passed from a local temporary file.
The key is never printed or uploaded; this test never sends funds.
"""
from __future__ import annotations

import os
import shutil
import struct
import urllib.request
import urllib.error
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ENDPOINT = "https://zps-testnet-gateway.onrender.com"
ORIGIN = "http://127.0.0.1:5173"
RPC = "/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo"


def protobuf_varint(message: bytes, start: int) -> tuple[int, int]:
    number, shift, offset = 0, 0, start
    while offset < len(message):
        octet = message[offset]
        offset += 1
        number |= (octet & 0x7F) << shift
        if not octet & 0x80:
            return number, offset
        shift += 7
        if shift > 70:
            raise ValueError("Malformed protobuf varint")
    raise ValueError("Truncated protobuf varint")


def protobuf_fields(data: bytes) -> dict[int, list]:
    values = {}
    index = 0
    while index < len(data):
        tag, index = protobuf_varint(data, index)
        field, wire = tag >> 3, tag & 7
        if wire == 0:
            value, index = protobuf_varint(data, index)
        elif wire == 2:
            length, index = protobuf_varint(data, index)
            value = data[index:index + length]
            index += length
        elif wire == 1:
            value, index = data[index:index + 8], index + 8
        elif wire == 5:
            value, index = data[index:index + 4], index + 4
        else:
            raise ValueError(f"Unsupported protobuf wire type {wire}")
        values.setdefault(field, []).append(value)
    return values


def public_tip() -> int:
    req = urllib.request.Request(
        ENDPOINT + RPC,
        data=b"\x00\x00\x00\x00\x00",
        headers={
            "Content-Type": "application/grpc-web+proto",
            "X-Grpc-Web": "1",
            "Origin": ORIGIN,
        },
    )
    with urllib.request.urlopen(req, timeout=100) as res:
        assert res.status == 200, f"RPC status {res.status}"
        assert res.headers.get("access-control-allow-origin") == ORIGIN, "Invalid gRPC-Web CORS"
        body = res.read(4096)
    assert len(body) > 5 and body[0] == 0, "Missing gRPC-Web data frame"
    size = struct.unpack(">I", body[1:5])[0]
    fields = protobuf_fields(body[5:5 + size])
    chain_name = fields[4][0].decode()
    assert chain_name.startswith("test"), f"Expected Zcash testnet, got {chain_name}"
    height = fields[7][0]
    assert isinstance(height, int) and height > 4_000_000, "Unexpected testnet chain tip"
    print("UPSTREAM_OK chain=testnet height=", height)
    return height


def main() -> None:
    keyfile = Path(os.environ["ZPS_TEST_KEY_PATH"])
    viewing_key = keyfile.read_text().strip()
    assert viewing_key.startswith("uview"), "Ephemeral testnet key derivation failed"
    birthday = public_tip()

    chrome = shutil.which("google-chrome") or shutil.which("chromium") or shutil.which("chromium-browser")
    assert chrome, "System Chrome/Chromium unavailable"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chrome,
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(
            viewport={"width": 1440, "height": 900},
            reduced_motion="reduce",
        )
        errors = []
        page.on("pageerror", lambda exc: errors.append(type(exc).__name__))
        try:
            page.goto(ORIGIN, wait_until="domcontentloaded", timeout=45000)
            assert page.evaluate("crossOriginIsolated"), "WebZjs thread isolation unavailable"
            expect(page.locator("#session-badge")).to_have_text("READY", timeout=45000)
            if page.locator("#mode-badge").inner_text() != "Real testnet":
                page.locator("#mode-testnet").click()
            expect(page.locator("#real-config")).to_be_visible()
            assert page.locator("#lightwalletd-url").input_value() == ENDPOINT
            page.locator("#viewing-key").fill(viewing_key)
            page.locator("#birthday-height").fill(str(birthday))
            page.locator("#open-testnet").click()

            # "Real testnet" mode is selected before the asynchronous WebZjs
            # open finishes. A usable create button and explicit ready status
            # are the actual readiness signal, not the mode badge.
            expect(page.locator("#create-session")).to_be_enabled(timeout=120000)
            expect(page.locator("#wallet-connection-status")).to_contain_text("wallet ready", timeout=120000)
            expect(page.locator("#open-testnet")).to_be_enabled(timeout=10000)
            expect(page.locator("#error-message")).to_be_empty()
            expect(page.locator("#mode-badge")).to_have_text("Real testnet")
            # Opens a real view-only WebZjs account; no simulated wallet is used.
            page.locator("#create-session").click()
            expect(page.locator("#qr-frame svg")).to_have_count(1, timeout=45000)
            uri = page.locator("#uri-display").input_value()
            assert uri.startswith("zcash:"), "SDK generated no real ZIP-321 URI"
            assert "utest" in uri or "ztestsapling" in uri, "Non-testnet recipient"
            assert page.locator("#viewing-key").input_value() == "", "Viewing key input not cleared"
            print("WALLET_OK view_only=1 zip321=1 recipient=testnet")
            page.locator("#refresh-status").click()
            expect(page.locator("#refresh-status")).to_be_enabled(timeout=120000)
            assert page.locator("#session-badge").inner_text() in {"AWAITING PAYMENT", "EXPIRED"}
            assert page.locator("#error-message").inner_text().strip() == "", "Wallet sync/refresh returned an error"
            print("SYNC_OK real_browser_wallet=1, no_payment_sent=1")
            assert not errors, f"Browser emitted {len(errors)} unhandled errors"
        except Exception:
            print("REAL_BROWSER_SMOKE_FAILED")
            print("MODE", page.locator("#mode-badge").inner_text())
            # Error message is emitted only as a short code/reason, never the UFVK.
            error = page.locator("#error-message").inner_text()[:240]
            if "uview" in error:
                error = "[redacted view-only key content]"
            print("UI_ERROR", repr(error))
            raise
        finally:
            page.close()
            browser.close()


if __name__ == "__main__":
    main()
