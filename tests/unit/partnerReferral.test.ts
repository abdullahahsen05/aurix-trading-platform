import { describe, expect, test } from "vitest";
import {
  generateReferralCode,
  isValidReferralCodeFormat,
  referralLink,
} from "@/lib/partner/referral";

describe("generateReferralCode", () => {
  test("derives a base from the seed and appends a suffix", () => {
    const code = generateReferralCode("Ayan Malik");
    expect(code).toMatch(/^AYANMA-[A-Z0-9]{5}$/);
  });

  test("falls back to PARTNER for empty/symbol-only seeds", () => {
    expect(generateReferralCode("")).toMatch(/^PARTNER-[A-Z0-9]{5}$/);
    expect(generateReferralCode("!!!")).toMatch(/^PARTNER-[A-Z0-9]{5}$/);
  });

  test("produces different suffixes across calls (uniqueness pressure)", () => {
    const a = generateReferralCode("acme");
    const b = generateReferralCode("acme");
    expect(a).not.toBe(b);
  });
});

describe("isValidReferralCodeFormat", () => {
  test("accepts well-formed codes", () => {
    expect(isValidReferralCodeFormat("AYANFX-7K2QD")).toBe(true);
  });
  test("rejects malformed codes", () => {
    expect(isValidReferralCodeFormat("nodash")).toBe(false);
    expect(isValidReferralCodeFormat("")).toBe(false);
  });
});

describe("referralLink", () => {
  test("builds a register link and trims trailing slash", () => {
    expect(referralLink("https://app.aurix.com/", "ABC-12345")).toBe(
      "https://app.aurix.com/register?partner=ABC-12345",
    );
  });
});
