import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { createLicenseForAccess } from "@/lib/services/botLicenseService";
import { writeAuditLog } from "@/lib/services/auditService";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const schema = z.object({
  mt5AccountNumber: z.string().min(1).max(50).trim(),
  platform: z.enum(["MT5", "MT4"]).default("MT5"),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ accessId: string }> }
) {
  try {
    const { accessId } = await context.params;
    const user = await requireAuth();

    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot issue licenses.", 403);
    }

    // Parse + validate body
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

    // Verify access record belongs to this user and is ACTIVE
    const supabase = createAdminClient();
    const { data: access, error } = await supabase
      .from("bot_access_records")
      .select("id, product_id, user_id, status")
      .eq("id", accessId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error || !access) {
      return jsonFail("NOT_FOUND", "Access record not found.", 404);
    }
    if (access.status !== "ACTIVE") {
      return jsonFail("ACCESS_NOT_ACTIVE", "Your access to this product is not active. Contact support.", 403);
    }

    // Check for existing active license on this access record
    const { data: existingLicense } = await supabase
      .from("bot_licenses")
      .select("id, status")
      .eq("access_record_id", accessId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (existingLicense) {
      return jsonFail(
        "LICENSE_ALREADY_EXISTS",
        "An active license already exists for this access record. Contact admin to reissue.",
        409
      );
    }

    const license = await createLicenseForAccess({
      productId: access.product_id as string,
      accessRecordId: accessId,
      userId: user.id,
      mt5AccountNumber: parsed.data.mt5AccountNumber,
      platform: parsed.data.platform,
      issuedBy: null,
    });

    await writeAuditLog({
      actorUserId: user.id,
      action: "BOT_LICENSE_ISSUED",
      entityType: "bot_license",
      entityId: license.id,
      metadata: {
        productId: access.product_id,
        accessRecordId: accessId,
        mt5AccountNumber: parsed.data.mt5AccountNumber,
        last4: license.licenseKeyLast4,
      },
    });

    return jsonOk(license);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail("UNAUTHORIZED", err.message, 401);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
