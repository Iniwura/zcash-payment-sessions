import { describe, expect, it } from "vitest";
import { parseTestnetBirthday } from "../examples/checkout/src/testnet-config.js";

describe("testnet checkout configuration", () => {
  it("requires an explicit non-negative birthday height", () => {
    expect(() => parseTestnetBirthday("")).toThrow(
      "Enter the testnet account birthday height"
    );
    expect(() => parseTestnetBirthday("-1")).toThrow(
      "Birthday height must be a non-negative integer"
    );
  });

  it("parses an explicit birthday height without changing it", () => {
    expect(parseTestnetBirthday("2800000")).toBe(2_800_000);
  });
});
