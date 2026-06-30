import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateAiUserLimits } from "@/lib/services/aiAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { aiUserLimitsUpdateSchema } from "@/lib/validation/schemas";

// PATCH /api/admin/ai/users/[id]/limits — update a user's AI limits / access (admin).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = aiUserLimitsUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("INVALID_BODY", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    await updateAiUserLimits(id, parsed.data);

    // Audit access toggles and limit changes separately for a clean trail.
    if (parsed.data.aiEnabled !== undefined) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: "AI_ACCESS_CHANGED",
        entityType: "profile",
        entityId: id,
        metadata: { aiEnabled: parsed.data.aiEnabled },
      });
    }
    if (parsed.data.chatDailyLimit !== undefined || parsed.data.chartDailyLimit !== undefined) {
      await writeAuditLog({
        actorUserId: admin.id,
        action: "AI_LIMITS_UPDATED",
        entityType: "profile",
        entityId: id,
        metadata: {
          chatDailyLimit: parsed.data.chatDailyLimit ?? null,
          chartDailyLimit: parsed.data.chartDailyLimit ?? null,
        },
      });
    }

    return jsonOk({ updated: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
