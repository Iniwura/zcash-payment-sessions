#!/usr/bin/env python3
"""Verify the gateway returns complete bytes of our historical Zcash testnet payment.

Public chain data only. No wallet credentials, simulation, broadcast, or spend.
"""
import struct
import urllib.request

BASE="https://zps-testnet-gateway.onrender.com"
ORIGIN="https://zcash-payment-sessions.vercel.app"
RPC="/cash.z.wallet.sdk.rpc.CompactTxStreamer/GetTransaction"

# Reversed byte representation used by our previously verified WebZjs receiver.
RAW_TXID="fc7c6c121b5608f91a7ac9f2fd73116527730cf6c1ca478bca34dece83aec981"
EXPECTED_HEIGHT=4490144


def varint(data, i):
    value=0
    shift=0
    while i<len(data):
        c=data[i]; i+=1
        value |= (c & 127) << shift
        if not c&128: return value,i
        shift+=7
    raise ValueError("truncated varint")


def proto(data):
    fields={}
    pos=0
    while pos<len(data):
        key,pos=varint(data,pos)
        num,wire=key>>3,key&7
        if wire==0:
            value,pos=varint(data,pos)
        elif wire==2:
            n,pos=varint(data,pos)
            value=data[pos:pos+n]; pos+=n
        else:
            raise ValueError("unexpected protobuf wire type "+str(wire))
        fields[num]=value
    return fields


def request():
    txid=bytes.fromhex(RAW_TXID)
    # TxFilter.hash is field 3, length-delimited (proto schema).
    message=b"\x1a\x20"+txid
    frame=b"\x00"+struct.pack(">I",len(message))+message
    req=urllib.request.Request(
        BASE+RPC,
        data=frame,
        headers={
            "Content-Type":"application/grpc-web+proto",
            "X-Grpc-Web":"1",
            "Origin":ORIGIN
        }
    )
    with urllib.request.urlopen(req,timeout=100) as response:
        print("HTTP",response.status,"CORS",response.headers.get("access-control-allow-origin"))
        assert response.status==200
        assert response.headers.get("access-control-allow-origin")==ORIGIN
        data=response.read(3_000_000)
    assert data[0]==0,"No protobuf response data"
    size=struct.unpack(">I",data[1:5])[0]
    obj=proto(data[5:5+size])
    assert len(obj[1])>100,"Missing historical raw transaction bytes"
    assert obj[2]==EXPECTED_HEIGHT,f"Unexpected height: {obj[2]}"
    extra=data[5+size:]
    assert extra and extra[0]&0x80,"Missing gRPC-Web status trailer"
    trailer_len=struct.unpack(">I",extra[1:5])[0]
    trailer=extra[5:5+trailer_len].decode("ascii","replace")
    assert "grpc-status:0" in trailer.replace(" ",""),f"RPC failure: {trailer!r}"
    print("PASS: GetTransaction chain=testnet height=",obj[2],"bytes=",len(obj[1]))


if __name__=="__main__":
    request()
