import crypto from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BotLicenseDto } from "@/lib/domain/types";

const KEY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no O/I/0/1
const KEY_SEGMENT_LEN = 4;
const KEY_SEGMENTS = 4;

// ── Key generation ────────────────────────────────────────────────────────────

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

export function hashLicenseKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

function last4(plaintext: string): string {
  return plaintext.slice(-4);
}

// ── Rate limit ────────────────────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 60;

export async function checkLicenseRateLimit(licenseId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("bot_license_verification_logs")
    .select("id", { count: "exact", head: true })
    .eq("license_id", licenseId)
    .gte("created_at", since);
  if (error) return true; // fail open to not break EAs, but log below
  return (count ?? 0) < RATE_LIMIT_MAX;
}

// ── Verification log ──────────────────────────────────────────────────────────

export async function logVerification(params: {
  licenseId: string | null;
  productId: string | null;
  mt5AccountNumber: string | null;
  botIdentifier: string | null;
  platform: string | null;
  version: string | null;
  valid: boolean;
  reason: string;
  ipHash: string | null;
  userAgentHash: string | null;
}): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("bot_license_verification_logs").insert({
    license_id: params.licenseId,
    product_id: params.productId,
    mt5_account_number: params.mt5AccountNumber,
    bot_identifier: params.botIdentifier,
    platform: params.platform,
    version: params.version,
    valid: params.valid,
    reason: params.reason,
    ip_hash: params.ipHash,
    user_agent_hash: params.userAgentHash,
  });
}

// ── IP/UA hashing for privacy ─────────────────────────────────────────────────

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return crypto.createHash("sha256").update(ip.trim()).digest("hex").slice(0, 16);
}

export function hashUa(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return crypto.createHash("sha256").update(ua.trim()).digest("hex").slice(0, 16);
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToLicense(
  row: Record<string, unknown>,
  plaintext?: string
): BotLicenseDto {
  const product = row.bot_products as Record<string, unknown> | null;
  return {
    id: row.id as string,
    productId: row.product_id as string,
    productName: (product?.name as string | null) ?? "",
    accessRecordId: row.access_record_id as string,
    mt5AccountNumber: row.mt5_account_number as string,
    platform: row.platform as string,
    licenseKeyLast4: row.license_key_last4 as string,
    ...(plaintext ? { licenseKeyPlaintext: plaintext } : {}),
    status: row.status as BotLicenseDto["status"],
    issuedAt: row.issued_at as string,
    expiresAt: (row.expires_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

// ── Issue ─────────────────────────────────────────────────────────────────────

export async function createLicenseForAccess(params: {
  productId: string;
  accessRecordId: string;
  userId: string;
  mt5AccountNumber: string;
  platform?: string;
  issuedBy?: string | null;
  expiresAt?: string | null;
}): Promise<BotLicenseDto> {
  const supabase = createAdminClient();

  const plaintext = generateRawKey();
  const keyHash = hashLicenseKey(plaintext);
  const keyLast4 = last4(plaintext);

  const { data, error } = await supabase
    .from("bot_licenses")
    .insert({
      product_id: params.productId,
      access_record_id: params.accessRecordId,
      user_id: params.userId,
      license_key_hash: keyHash,
      license_key_last4: keyLast4,
      mt5_account_number: params.mt5AccountNumber,
      platform: params.platform ?? "MT5",
      status: "ACTIVE",
      issued_by: params.issuedBy ?? null,
      issued_at: new Date().toISOString(),
      expires_at: params.expiresAt ?? null,
    })
    .select("*, bot_products(name)")
    .single();

  if (error) throw new Error(error.message);
  return rowToLicense(data as Record<string, unknown>, plaintext);
}

// ── Reissue ───────────────────────────────────────────────────────────────────

export async function reissueLicense(params: {
  oldLicenseId: string;
  issuedBy: string;
}): Promise<BotLicenseDto> {
  const supabase = createAdminClient();

  const { data: old, error: fetchErr } = await supabase
    .from("bot_licenses")
    .select("*, bot_products(name)")
    .eq("id", params.oldLicenseId)
    .single();

  if (fetchErr || !old) throw new Error("License not found");

  const r = old as Record<string, unknown>;

  // Revoke old license
  await supabase
    .from("bot_licenses")
    .update({ status: "REVOKED", revoked_at: new Date().toISOString(), revoked_by: params.issuedBy })
    .eq("id", params.oldLicenseId);

  const plaintext = generateRawKey();
  const keyHash = hashLicenseKey(plaintext);
  const keyLast4 = last4(plaintext);

  const { data: newRow, error: insertErr } = await supabase
    .from("bot_licenses")
    .insert({
      product_id: r.product_id,
      access_record_id: r.access_record_id,
      user_id: r.user_id,
      license_key_hash: keyHash,
      license_key_last4: keyLast4,
      mt5_account_number: r.mt5_account_number,
      platform: r.platform,
      status: "ACTIVE",
      issued_by: params.issuedBy,
      issued_at: new Date().toISOString(),
      expires_at: r.expires_at ?? null,
      reissue_of: params.oldLicenseId,
    })
    .select("*, bot_products(name)")
    .single();

  if (insertErr) throw new Error(insertErr.message);
  return rowToLicense(newRow as Record<string, unknown>, plaintext);
}

// ── Revoke ────────────────────────────────────────────────────────────────────

export async function revokeLicense(licenseId: string, revokedBy: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("bot_licenses")
    .update({ status: "REVOKED", revoked_at: new Date().toISOString(), revoked_by: revokedBy })
    .eq("id", licenseId);
  if (error) throw new Error(error.message);
}

// ── List ──────────────────────────────────────────────────────────────────────

export async function listLicensesForUser(userId: string): Promise<BotLicenseDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_licenses")
    .select("*, bot_products(name)")
    .eq("user_id", userId)
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToLicense(r as Record<string, unknown>));
}

export async function adminListAllLicenses(): Promise<BotLicenseDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_licenses")
    .select("*, bot_products(name)")
    .order("issued_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToLicense(r as Record<string, unknown>));
}

// ── Verification ──────────────────────────────────────────────────────────────

export interface VerifyLicenseResult {
  valid: boolean;
  reason: string;
  productId?: string;
  productName?: string;
  platform?: string;
  expiresAt?: string | null;
}

export async function verifyLicense(params: {
  licenseKey: string;
  mt5AccountNumber: string;
}): Promise<VerifyLicenseResult> {
  const supabase = createAdminClient();

  const keyHash = hashLicenseKey(params.licenseKey.trim().toUpperCase());

  const { data, error } = await supabase
    .from("bot_licenses")
    .select("*, bot_products(name)")
    .eq("license_key_hash", keyHash)
    .maybeSingle();

  if (error || !data) {
    return { valid: false, reason: "LICENSE_NOT_FOUND" };
  }

  const r = data as Record<string, unknown>;
  const product = r.bot_products as Record<string, unknown> | null;

  if (r.status !== "ACTIVE") {
    return { valid: false, reason: `LICENSE_${r.status as string}` };
  }

  // Constant-time account number comparison
  const storedAccount = Buffer.from(r.mt5_account_number as string, "utf-8");
  const providedAccount = Buffer.from(params.mt5AccountNumber.trim(), "utf-8");
  const accountMatch =
    storedAccount.length === providedAccount.length &&
    crypto.timingSafeEqual(storedAccount, providedAccount);

  if (!accountMatch) {
    return { valid: false, reason: "ACCOUNT_MISMATCH" };
  }

  if (r.expires_at && new Date(r.expires_at as string) < new Date()) {
    return { valid: false, reason: "LICENSE_EXPIRED" };
  }

  return {
    valid: true,
    reason: "OK",
    productId: r.product_id as string,
    productName: (product?.name as string | null) ?? undefined,
    platform: r.platform as string,
    expiresAt: (r.expires_at as string | null) ?? null,
  };
}
