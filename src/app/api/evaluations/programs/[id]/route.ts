import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { startEvaluationAttempt } from "@/lib/services/evaluationService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    try {
      const attempt = await startEvaluationAttempt(user.id, id);
      return jsonOk(attempt, { status: 201 });
    } catch (svcErr) {
      const msg = svcErr instanceof Error ? svcErr.message : "Unknown error";
      const STATUS_MAP: Record<string, number> = {
        PROGRAM_NOT_FOUND: 404,
        PROGRAM_NOT_PUBLISHED: 400,
        ACADEMY_NOT_COMPLETED: 403,
        ATTEMPT_ALREADY_EXISTS: 409,
      };
      return jsonFail(msg, msg, STATUS_MAP[msg] ?? 400);
    }
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
