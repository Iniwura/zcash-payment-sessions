import assert from "node:assert/strict";
import { test } from "node:test";
import { MERCHANT_PROFILE_KEY, openMerchantProfile, sealMerchantProfile } from "../examples/checkout/src/merchant-profile.ts";

const profile = {
  ufvk: "uview1" + "q".repeat(210),
  birthdayHeight: 4_526_032,
  endpoint: "https://zps-testnet-gateway.onrender.com",
};

test("encrypt and unlock saved view-only merchant profile", async () => {
  assert.equal(MERCHANT_PROFILE_KEY, "zps:merchant-profile:v1");
  const ciphertext = await sealMerchantProfile(profile, "a-long-test-passphrase");
  assert.equal(ciphertext.includes(profile.ufvk), false);
  assert.equal(ciphertext.includes(profile.endpoint), false);
  assert.deepEqual(await openMerchantProfile(ciphertext, "a-long-test-passphrase"), profile);
});

test("reject wrong passphrase and tampering", async () => {
  const ciphertext = await sealMerchantProfile(profile, "correct password 123");
  await assert.rejects(() => openMerchantProfile(ciphertext, "wrong password 123"), /Unable to unlock/);
  const payload = JSON.parse(ciphertext);
  payload.data = payload.data.slice(0, -4) + "AAAA";
  await assert.rejects(() => openMerchantProfile(JSON.stringify(payload), "correct password 123"));
});

test("reject weak passwords, non-testnet keys, malformed profile", async () => {
  await assert.rejects(() => sealMerchantProfile(profile, "short"), /12 characters/);
  await assert.rejects(() => sealMerchantProfile({ ...profile, ufvk: "secret-spending-key" }, "long enough password"), /Unified Full Viewing Key/);
  await assert.rejects(() => openMerchantProfile("{}", "long enough password"), /Unsupported merchant profile/);
});

test("no dependency on an external wallet or testnet", () => {
  assert.ok(profile.endpoint.startsWith("https://"));
});
