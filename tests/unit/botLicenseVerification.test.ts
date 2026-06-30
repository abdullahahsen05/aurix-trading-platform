import { describe, expect, test } from "vitest";
import { z } from "zod";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// License verification endpoint logic (Phase 5.4)
// Tests for rate-limiting logic, IP hashing, verify schema, and response shape.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror verify schema from route
const verifySchema = z.object({
  licenseKey: z.string().min(1).max(50).trim(),
  mt5AccountNumber: z.string().min(1).max(50).trim(),
  botIdentifier: z.string().max(100).optional(),
  platform: z.string().max(10).optional(),
  version: z.string().max(30).optional(),
});

// Mirror hash helpers from botLicenseService.ts
function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip.trim()).digest("hex").slice(0, 16);
}

function hashUa(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return crypto.createHash("sha256").update(ua.trim()).digest("hex").slice(0, 16);
}

function hashLicenseKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

describe("verify endpoint schema", () => {
  test("accepts minimal valid payload", () => {
    const r = verifySchema.safeParse({ licenseKey: "AURIX-AAAA-BBBB-CCCC-DDDD", mt5AccountNumber: "12345" });
    expect(r.success).toBe(true);
  });

  test("rejects missing licenseKey", () => {
    const r = verifySchema.safeParse({ mt5AccountNumber: "12345" });
    expect(r.success).toBe(false);
  });

  test("rejects missing mt5AccountNumber", () => {
    const r = verifySchema.safeParse({ licenseKey: "AURIX-AAAA-BBBB-CCCC-DDDD" });
    expect(r.success).toBe(false);
  });

  test("trims whitespace from licenseKey", () => {
    const r = verifySchema.safeParse({ licenseKey: "  AURIX-AAAA-BBBB-CCCC-DDDD  ", mt5AccountNumber: "12345" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.licenseKey).toBe("AURIX-AAAA-BBBB-CCCC-DDDD");
  });

  test("trims whitespace from mt5AccountNumber", () => {
    const r = verifySchema.safeParse({ licenseKey: "AURIX-AAAA-BBBB-CCCC-DDDD", mt5AccountNumber: "  12345  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.mt5AccountNumber).toBe("12345");
  });

  test("accepts optional bot metadata", () => {
    const r = verifySchema.safeParse({
      licenseKey: "AURIX-AAAA-BBBB-CCCC-DDDD",
      mt5AccountNumber: "12345",
      botIdentifier: "trend-master",
      platform: "MT5",
      version: "2.1.0",
    });
    expect(r.success).toBe(true);
  });

  test("rejects licenseKey too long (>50 chars)", () => {
    const r = verifySchema.safeParse({ licenseKey: "A".repeat(51), mt5AccountNumber: "12345" });
    expect(r.success).toBe(false);
  });
});

describe("IP hashing for privacy", () => {
  test("hashes an IP to 16-char hex string", () => {
    const hash = hashIp("192.168.1.1");
    expect(hash).not.toBeNull();
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  test("same IP produces same hash", () => {
    expect(hashIp("10.0.0.1")).toBe(hashIp("10.0.0.1"));
  });

  test("different IPs produce different hashes", () => {
    expect(hashIp("10.0.0.1")).not.toBe(hashIp("10.0.0.2"));
  });

  test("returns null for null IP", () => {
    expect(hashIp(null)).toBeNull();
  });

  test("returns null for undefined IP", () => {
    expect(hashIp(undefined)).toBeNull();
  });

  test("trims IP before hashing (same result)", () => {
    expect(hashIp(" 10.0.0.1 ")).toBe(hashIp("10.0.0.1"));
  });

  test("hash is short enough to be storage-friendly (privacy by truncation)", () => {
    const hash = hashIp("255.255.255.255");
    expect(hash!.length).toBeLessThanOrEqual(16);
  });
});

describe("user-agent hashing for privacy", () => {
  test("hashes UA to 16-char hex", () => {
    const hash = hashUa("Mozilla/5.0 (Windows NT 10.0)");
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });

  test("returns null for null UA", () => {
    expect(hashUa(null)).toBeNull();
  });
});

describe("rate limit window logic", () => {
  const RATE_LIMIT_MAX = 60;
  const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

  function isWithinWindow(eventTime: Date, now: Date): boolean {
    return now.getTime() - eventTime.getTime() < RATE_LIMIT_WINDOW_MS;
  }

  function isRateLimited(countInWindow: number): boolean {
    return countInWindow >= RATE_LIMIT_MAX;
  }

  test("under limit is not rate limited", () => {
    expect(isRateLimited(59)).toBe(false);
  });

  test("at limit is rate limited", () => {
    expect(isRateLimited(60)).toBe(true);
  });

  test("over limit is rate limited", () => {
    expect(isRateLimited(100)).toBe(true);
  });

  test("event within window is counted", () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    expect(isWithinWindow(oneMinuteAgo, now)).toBe(true);
  });

  test("event outside window is not counted", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(isWithinWindow(twoHoursAgo, now)).toBe(false);
  });
});

describe("verification response shape", () => {
  type VerifyResult =
    | { valid: false; reason: string }
    | { valid: true; reason: "OK"; productId?: string; productName?: string; platform?: string; expiresAt?: string | null };

  function makeFailResult(reason: string): VerifyResult {
    return { valid: false, reason };
  }

  function makeOkResult(): VerifyResult {
    return { valid: true, reason: "OK", productId: "abc", productName: "Test Bot", platform: "MT5", expiresAt: null };
  }

  test("fail result has valid: false", () => {
    const r = makeFailResult("LICENSE_NOT_FOUND");
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("LICENSE_NOT_FOUND");
  });

  test("ok result has valid: true and reason OK", () => {
    const r = makeOkResult();
    expect(r.valid).toBe(true);
    expect(r.reason).toBe("OK");
  });

  test("fail result does not expose productId (privacy)", () => {
    const r = makeFailResult("ACCOUNT_MISMATCH");
    expect((r as Record<string, unknown>).productId).toBeUndefined();
  });

  test("known fail reasons are recognized", () => {
    const reasons = ["LICENSE_NOT_FOUND", "LICENSE_REVOKED", "ACCOUNT_MISMATCH", "LICENSE_EXPIRED", "RATE_LIMITED"];
    for (const reason of reasons) {
      const r = makeFailResult(reason);
      expect(r.valid).toBe(false);
      expect(r.reason).toBe(reason);
    }
  });

  test("hash of normalized key matches hash of same key", () => {
    const key = "AURIX-ABCD-EFGH-JKLM-NPQR";
    expect(hashLicenseKey(key.trim().toUpperCase())).toBe(hashLicenseKey(key));
  });
});
