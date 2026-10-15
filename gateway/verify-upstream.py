#!/usr/bin/env python3
"""Smoke test public Render gRPC-Web proxy and upstream Zcash testnet.
No wallets, keys, payments, or secrets are involved.
"""
import struct
import urllib.request
import urllib.error

BASE = "https://zps-testnet-gateway.onrender.com"
ORIGIN = "https://zcash-payment-sessions.vercel.app"
RPC = "/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetLightdInfo"


def call(url, data=None, headers=None):
    req = urllib.request.Request(url, data=data, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=80) as response:
            return response.status, response.headers, response.read(1048576)
    except urllib.error.HTTPError as error:
        return error.code, error.headers, error.read(16384)


def grpc_web_frames(body):
    pos = 0
    parsed = []
    while pos < len(body):
        assert len(body) - pos >= 5, "Incomplete gRPC-Web frame header"
        flag, n = struct.unpack(">BI", body[pos:pos + 5])
        pos += 5
        assert n <= len(body) - pos, "Incomplete gRPC-Web payload"
        parsed.append((flag, body[pos:pos + n]))
        pos += n
    return parsed


status, headers, body = call(BASE + "/healthz")
print("Health HTTP:", status, repr(body[:120]))
assert status == 200, "Render gateway health check failed"

status, headers, body = call(
    BASE + RPC,
    data=b"\x00\x00\x00\x00\x00",
    headers={
        "Content-Type": "application/grpc-web+proto",
        "X-Grpc-Web": "1",
        "Origin": ORIGIN,
    },
)
print("Upstream HTTP:", status, "Content-Type:", headers.get("content-type"))
print("CORS:", headers.get("access-control-allow-origin"))
if status != 200:
    print("Failure response:", repr(body[:1000]))
assert status == 200, "Upstream RPC request failed"
assert headers.get("access-control-allow-origin") == ORIGIN, "Production CORS not allowed"

frames = grpc_web_frames(body)
print("Frames:", [(hex(flag), len(payload)) for flag, payload in frames])
trailers = {}
for flag, payload in frames:
    if flag & 0x80:
        for line in payload.decode("ascii", "replace").split("\r\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                trailers[key.lower().strip()] = value.strip()
grpc_status = trailers.get("grpc-status", headers.get("grpc-status"))
print("gRPC status:", grpc_status, "Trailers:", trailers)
assert grpc_status == "0", "Upstream returned gRPC error"
messages = [payload for flag, payload in frames if (flag & 0x80) == 0]
assert len(messages) == 1 and len(messages[0]) > 12, "Missing LightdInfo response"
assert b"test" in messages[0].lower(), "Response does not identify testnet"
print("PASS: Real LightdInfo protobuf from Zcash testnet through Render")
