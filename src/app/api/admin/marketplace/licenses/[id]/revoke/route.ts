import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { revokeLicense } from "@/lib/services/botLicenseService";
import { writeAuditLog } from "@/lib/services/auditService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();

    await revokeLicense(id, admin.id);

    await writeAuditLog({
      actorUserId: admin.id,
      action: "BOT_LICENSE_REVOKED",
      entityType: "bot_license",
      entityId: id,
    });

    return jsonOk({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
