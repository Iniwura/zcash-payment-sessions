import assert from "node:assert/strict";

const sdk = await import("zcash-payment-sessions");

assert.equal(typeof sdk.ZcashPaymentSessions, "function");
assert.equal(typeof sdk.ZcashPaymentSessions.create, "function");
assert.equal(sdk.createZip321Uri, undefined);

console.log("consumer smoke passed: imported zcash-payment-sessions package facade");
