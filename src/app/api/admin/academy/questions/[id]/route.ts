import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminAnswerQuestion, adminUpdateQuestionStatus } from "@/lib/services/academyAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const schema = z.object({
  answer: z.string().min(1).max(10000).optional(),
  status: z.enum(["OPEN", "ANSWERED", "HIDDEN"]).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();
    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    if (parsed.data.answer) {
      const q = await adminAnswerQuestion(id, parsed.data.answer, admin.id);
      await writeAuditLog({ actorUserId: admin.id, action: "ACADEMY_QUESTION_ANSWERED", entityType: "academy_question", entityId: id });
      return jsonOk(q);
    }
    if (parsed.data.status) {
      await adminUpdateQuestionStatus(id, parsed.data.status);
      return jsonOk({ updated: true });
    }
    return jsonFail("VALIDATION_ERROR", "Provide answer or status.", 400);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
