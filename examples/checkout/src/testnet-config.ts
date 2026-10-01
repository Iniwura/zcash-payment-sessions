export const DEFAULT_TESTNET_GRPC_WEB_ENDPOINT =
  "http://127.0.0.1:18080";

export function parseTestnetBirthday(value: string): number {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error("Enter the testnet account birthday height");
  }

  const birthday = Number(normalized);
  if (!Number.isSafeInteger(birthday) || birthday < 0) {
    throw new Error("Birthday height must be a non-negative integer");
  }

  return birthday;
}
