/**
 * Optional merchant-only viewing profile.
 * Encrypts the *viewing key*, never a seed or spending key, in browser local storage.
 * PBKDF2/AES-GCM is passphrase protection, not a substitute for a trusted browser.
 */
export const MERCHANT_PROFILE_KEY = "zps:merchant-profile:v1";
const AAD = new TextEncoder().encode("ZPS merchant viewing profile v1");
const ITERATIONS = 310_000;

export interface MerchantViewingProfile {
  ufvk: string;
  birthdayHeight?: number;
  endpoint: string;
}
interface VaultV1 { v: 1; salt: string; iv: string; data: string; }

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
function fromBase64(value: string): Uint8Array {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length === 0) {
    throw new Error("Invalid merchant profile encoding");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}
async function derive(passphrase: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase),
    { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 }, false, usage
  );
}
function validate(profile: MerchantViewingProfile): void {
  if (!profile.ufvk.startsWith("uview") || profile.ufvk.length < 60) {
    throw new Error("Only a testnet Unified Full Viewing Key can be stored");
  }
  if (profile.endpoint.trim().length === 0 || !profile.endpoint.startsWith("https://")) {
    throw new Error("A secure testnet endpoint is required");
  }
  if (profile.birthdayHeight !== undefined &&
      (!Number.isSafeInteger(profile.birthdayHeight) || profile.birthdayHeight < 0)) {
    throw new Error("Invalid account birthday");
  }
}
export async function sealMerchantProfile(profile: MerchantViewingProfile, passphrase: string): Promise<string> {
  if (passphrase.length < 12) throw new Error("Use a merchant passphrase of at least 12 characters");
  validate(profile);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt, ["encrypt"]);
  const plaintext = new TextEncoder().encode(JSON.stringify(profile));
  try {
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, plaintext);
    return JSON.stringify({ v: 1, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(encrypted)) } satisfies VaultV1);
  } finally {
    plaintext.fill(0);
  }
}
export async function openMerchantProfile(sealed: string, passphrase: string): Promise<MerchantViewingProfile> {
  let vault: Partial<VaultV1>;
  try { vault = JSON.parse(sealed) as Partial<VaultV1>; }
  catch { throw new Error("Saved merchant profile is invalid"); }
  if (vault?.v !== 1 || typeof vault.salt !== "string" || typeof vault.iv !== "string" ||
      typeof vault.data !== "string") throw new Error("Unsupported merchant profile format");
  const salt = fromBase64(vault.salt);
  const iv = fromBase64(vault.iv);
  if (salt.length !== 16 || iv.length !== 12) throw new Error("Invalid merchant profile parameters");
  const key = await derive(passphrase, salt, ["decrypt"]);
  let plaintext: Uint8Array;
  try {
    plaintext = new Uint8Array(await crypto.subtle.decrypt(
      { name: "AES-GCM", iv, additionalData: AAD }, key, fromBase64(vault.data)
    ));
  } catch {
    throw new Error("Unable to unlock merchant profile. Check your passphrase");
  }
  try {
    const profile = JSON.parse(new TextDecoder().decode(plaintext)) as MerchantViewingProfile;
    validate(profile);
    return profile;
  } finally {
    plaintext.fill(0);
  }
}
