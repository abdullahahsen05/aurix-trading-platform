import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { adminGrantAccess, adminUpdateAccessStatus } from "@/lib/services/botMarketplaceService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("grant"),
    expiresAt: z.string().datetime().nullable().optional(),
  }),
  z.object({ action: z.literal("suspend") }),
  z.object({ action: z.literal("revoke") }),
  z.object({ action: z.literal("reactivate") }),
]);

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonFail("VALIDATION_ERROR", "Invalid JSON body.", 400);
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);
    }

    if (parsed.data.action === "grant") {
      await adminGrantAccess(id, admin.id, parsed.data.expiresAt ?? null);
      await writeAuditLog({
        actorUserId: admin.id,
        action: "BOT_ACCESS_GRANTED",
        entityType: "bot_access_record",
        entityId: id,
        metadata: { expiresAt: parsed.data.expiresAt ?? null },
      });
    } else if (parsed.data.action === "suspend") {
      await adminUpdateAccessStatus(id, "SUSPENDED");
      await writeAuditLog({
        actorUserId: admin.id,
        action: "BOT_ACCESS_SUSPENDED",
        entityType: "bot_access_record",
        entityId: id,
      });
    } else if (parsed.data.action === "revoke") {
      await adminUpdateAccessStatus(id, "REVOKED");
      await writeAuditLog({
        actorUserId: admin.id,
        action: "BOT_ACCESS_REVOKED",
        entityType: "bot_access_record",
        entityId: id,
      });
    } else if (parsed.data.action === "reactivate") {
      await adminUpdateAccessStatus(id, "ACTIVE");
      await writeAuditLog({
        actorUserId: admin.id,
        action: "BOT_ACCESS_GRANTED",
        entityType: "bot_access_record",
        entityId: id,
        metadata: { reactivated: true },
      });
    }

    return jsonOk({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
