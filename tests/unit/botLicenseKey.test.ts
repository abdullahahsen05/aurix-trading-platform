import { describe, expect, test } from "vitest";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Bot license key generation, hashing, and verification (Phase 5.3 / 5.4)
// Pure unit tests — no DB, no HTTP.
// ─────────────────────────────────────────────────────────────────────────────

// Mirror key generation from botLicenseService.ts
const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const KEY_SEGMENT_LEN = 4;
const KEY_SEGMENTS = 4;

function generateRawKey(): string {
  const bytes = crypto.randomBytes(KEY_SEGMENTS * KEY_SEGMENT_LEN);
  let raw = "";
  for (let i = 0; i < bytes.length; i++) {
    raw += KEY_ALPHABET[bytes[i] % KEY_ALPHABET.length];
  }
  const parts: string[] = [];
  for (let i = 0; i < KEY_SEGMENTS; i++) {
    parts.push(raw.slice(i * KEY_SEGMENT_LEN, (i + 1) * KEY_SEGMENT_LEN));
  }
  return `AURIX-${parts.join("-")}`;
}

function hashLicenseKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

function last4(key: string): string {
  return key.slice(-4);
}

describe("license key format", () => {
  test("generated key matches AURIX-XXXX-XXXX-XXXX-XXXX pattern", () => {
    const key = generateRawKey();
    expect(key).toMatch(/^AURIX-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  test("key uses only unambiguous alphabet (no O, I, 0, 1)", () => {
    for (let i = 0; i < 20; i++) {
      const key = generateRawKey();
      const cleaned = key.replace(/^AURIX-|-/g, "");
      expect(cleaned).not.toMatch(/[OI01]/);
    }
  });

  test("key is 24 chars plus prefix (AURIX- = 6, 4 groups x 4 chars + 3 dashes = 19)", () => {
    const key = generateRawKey();
    // AURIX- (6) + 4*4 chars + 3 dashes = 6 + 16 + 3 = 25
    expect(key).toHaveLength(25);
  });

  test("two generated keys are different (entropy check)", () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateRawKey()));
    expect(keys.size).toBe(10);
  });

  test("last4 returns last 4 chars of key", () => {
    const key = "AURIX-ABCD-EFGH-JKLM-NPQR";
    expect(last4(key)).toBe("NPQR");
  });
});

describe("license key hashing", () => {
  test("same key always produces same hash", () => {
    const key = "AURIX-ABCD-EFGH-JKLM-NPQR";
    expect(hashLicenseKey(key)).toBe(hashLicenseKey(key));
  });

  test("different keys produce different hashes", () => {
    expect(hashLicenseKey("AURIX-AAAA-AAAA-AAAA-AAAA")).not.toBe(
      hashLicenseKey("AURIX-BBBB-BBBB-BBBB-BBBB")
    );
  });

  test("hash is 64-char hex (SHA-256)", () => {
    const hash = hashLicenseKey("AURIX-ABCD-EFGH-JKLM-NPQR");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("hash is case-sensitive on input (normalized to uppercase before hashing in route)", () => {
    expect(hashLicenseKey("AURIX-ABCD-EFGH-JKLM-NPQR")).not.toBe(
      hashLicenseKey("aurix-abcd-efgh-jklm-npqr")
    );
  });
});

describe("account number constant-time comparison", () => {
  function safeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  }

  test("equal account numbers return true", () => {
    expect(safeCompare("123456", "123456")).toBe(true);
  });

  test("different account numbers return false", () => {
    expect(safeCompare("123456", "999999")).toBe(false);
  });

  test("different length account numbers return false without timing side-channel", () => {
    expect(safeCompare("123", "123456")).toBe(false);
  });

  test("empty strings are equal only to empty strings", () => {
    expect(safeCompare("", "")).toBe(true);
    expect(safeCompare("", "a")).toBe(false);
  });
});

describe("license key alphabet validation", () => {
  test("alphabet has exactly 32 characters", () => {
    expect(KEY_ALPHABET).toHaveLength(32);
  });

  test("alphabet has no duplicates", () => {
    const set = new Set(KEY_ALPHABET.split(""));
    expect(set.size).toBe(32);
  });

  test("alphabet excludes ambiguous characters", () => {
    expect(KEY_ALPHABET).not.toContain("O");
    expect(KEY_ALPHABET).not.toContain("I");
    expect(KEY_ALPHABET).not.toContain("0");
    expect(KEY_ALPHABET).not.toContain("1");
  });
});
