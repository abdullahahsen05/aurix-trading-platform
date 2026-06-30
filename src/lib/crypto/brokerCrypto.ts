if (typeof window !== "undefined") {
  throw new Error("[aurix] brokerCrypto is server-only.");
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// ─────────────────────────────────────────────────────────────────────────────
// AES-256-GCM secret encryption for broker credentials (server-only).
//
// The 256-bit key is derived from ENCRYPTION_KEY via SHA-256 so any key length
// works safely. Ciphertext format: base64(iv):base64(authTag):base64(ciphertext).
// Never log plaintext or the key.
// ─────────────────────────────────────────────────────────────────────────────

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY is not configured.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext.");
  }
  const [ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
