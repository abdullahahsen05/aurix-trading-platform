import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { reissueLicense } from "@/lib/services/botLicenseService";
import { writeAuditLog } from "@/lib/services/auditService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();

    const license = await reissueLicense({ oldLicenseId: id, issuedBy: admin.id });

    await writeAuditLog({
      actorUserId: admin.id,
      action: "BOT_LICENSE_REISSUED",
      entityType: "bot_license",
      entityId: license.id,
      metadata: { reissueOf: id, last4: license.licenseKeyLast4 },
    });

    return jsonOk(license);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
