import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto/brokerCrypto";

const ORIGINAL = process.env.ENCRYPTION_KEY;

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";
});
afterEach(() => {
  process.env.ENCRYPTION_KEY = ORIGINAL;
});

describe("brokerCrypto", () => {
  test("round-trips a secret", () => {
    const payload = JSON.stringify({ login: "12345", password: "s3cr3t!", server: "Broker-Demo", platform: "mt5" });
    const enc = encryptSecret(payload);
    expect(enc).not.toContain("s3cr3t!");
    expect(decryptSecret(enc)).toBe(payload);
  });

  test("ciphertext is non-deterministic (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  test("tampered ciphertext fails authentication", () => {
    const enc = encryptSecret("hello");
    const [iv, tag] = enc.split(":");
    const tampered = [iv, tag, Buffer.from("evil").toString("base64")].join(":");
    expect(() => decryptSecret(tampered)).toThrow();
  });

  test("malformed payload throws", () => {
    expect(() => decryptSecret("not-valid")).toThrow();
  });

  test("wrong key cannot decrypt", () => {
    const enc = encryptSecret("hello");
    process.env.ENCRYPTION_KEY = "a-different-key";
    expect(() => decryptSecret(enc)).toThrow();
  });
});
