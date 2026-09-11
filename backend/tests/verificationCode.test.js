// tests/verificationCode.test.js
// Pure unit tests for the verification-code primitives (no DB, no email).

import { describe, it, expect } from "vitest";
import {
  generateCode,
  hashCode,
  compareCode,
  isWellFormedCode,
  codeExpiryDate,
  pendingPurgeDate,
  CODE_LENGTH,
} from "../src/utils/verificationCode.js";

describe("generateCode", () => {
  it("produces a zero-padded numeric string of the configured length", () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode();
      expect(code).toMatch(new RegExp(`^\\d{${CODE_LENGTH}}$`));
      expect(code.length).toBe(CODE_LENGTH);
    }
  });

  it("is not trivially constant across calls", () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateCode()));
    // With a 10^6 space, 50 draws colliding down to 1 value is effectively impossible.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("hashCode / compareCode", () => {
  it("never returns the plaintext and verifies correctly", async () => {
    const code = generateCode();
    const hash = await hashCode(code);
    expect(hash).not.toBe(code);
    expect(hash).not.toContain(code);
    expect(await compareCode(code, hash)).toBe(true);
  });

  it("rejects an incorrect code", async () => {
    const hash = await hashCode("123456");
    expect(await compareCode("654321", hash)).toBe(false);
  });

  it("is safe against null/empty inputs", async () => {
    const hash = await hashCode("111111");
    expect(await compareCode("", hash)).toBe(false);
    expect(await compareCode("111111", "")).toBe(false);
    expect(await compareCode(null, hash)).toBe(false);
  });
});

describe("isWellFormedCode", () => {
  it("accepts exactly CODE_LENGTH digits and rejects everything else", () => {
    expect(isWellFormedCode("1".repeat(CODE_LENGTH))).toBe(true);
    expect(isWellFormedCode("12345")).toBe(CODE_LENGTH === 5);
    expect(isWellFormedCode("12ab56")).toBe(false);
    expect(isWellFormedCode("")).toBe(false);
    expect(isWellFormedCode(123456)).toBe(false); // must be a string
    expect(isWellFormedCode(" 123456 ".trim())).toBe(CODE_LENGTH === 6);
  });
});

describe("expiry helpers", () => {
  it("codeExpiryDate is in the future and before the pending purge", () => {
    const now = new Date();
    const codeExp = codeExpiryDate(now);
    const purge = pendingPurgeDate(now);
    expect(codeExp.getTime()).toBeGreaterThan(now.getTime());
    expect(purge.getTime()).toBeGreaterThanOrEqual(codeExp.getTime());
  });
});
