import { jsonFail, jsonOk } from "@/lib/api/envelope";
import {
  verifyLicense,
  checkLicenseRateLimit,
  logVerification,
  hashIp,
  hashUa,
  hashLicenseKey,
} from "@/lib/services/botLicenseService";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  licenseKey: z.string().min(1).max(50).trim(),
  mt5AccountNumber: z.string().min(1).max(50).trim(),
  botIdentifier: z.string().max(100).optional(),
  platform: z.string().max(10).optional(),
  version: z.string().max(30).optional(),
});

export async function POST(req: Request) {
  // Rate limit by IP before anything else (10 req/min per IP via a cheap DB check is overkill;
  // we do per-license rate limiting inside verifyLicense flow).
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonFail("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);
  }

  const { licenseKey, mt5AccountNumber, botIdentifier, platform, version } = parsed.data;

  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip");
  const ua = req.headers.get("user-agent");
  const ipHash = hashIp(ip);
  const uaHash = hashUa(ua);

  // Find license by hash so we can rate-limit by license_id
  const supabase = createAdminClient();
  const keyHash = hashLicenseKey(licenseKey.toUpperCase());
  const { data: licenseRow } = await supabase
    .from("bot_licenses")
    .select("id")
    .eq("license_key_hash", keyHash)
    .maybeSingle();

  const licenseId = (licenseRow as { id: string } | null)?.id ?? null;

  // Per-license rate limit
  if (licenseId) {
    const allowed = await checkLicenseRateLimit(licenseId);
    if (!allowed) {
      await logVerification({
        licenseId,
        productId: null,
        mt5AccountNumber,
        botIdentifier: botIdentifier ?? null,
        platform: platform ?? null,
        version: version ?? null,
        valid: false,
        reason: "RATE_LIMITED",
        ipHash,
        userAgentHash: uaHash,
      });
      return jsonFail("RATE_LIMITED", "Too many verification requests. Try again later.", 429);
    }
  }

  const result = await verifyLicense({ licenseKey, mt5AccountNumber });

  await logVerification({
    licenseId,
    productId: result.valid ? (result.productId ?? null) : null,
    mt5AccountNumber,
    botIdentifier: botIdentifier ?? null,
    platform: platform ?? null,
    version: version ?? null,
    valid: result.valid,
    reason: result.reason,
    ipHash,
    userAgentHash: uaHash,
  });

  if (!result.valid) {
    return jsonOk({
      valid: false,
      reason: result.reason,
    });
  }

  return jsonOk({
    valid: true,
    reason: "OK",
    productId: result.productId,
    productName: result.productName,
    platform: result.platform,
    expiresAt: result.expiresAt,
  });
}
