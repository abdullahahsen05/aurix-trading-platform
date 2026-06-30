import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getMyEvaluationAttemptDetail } from "@/lib/services/evaluationService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    const attempt = await getMyEvaluationAttemptDetail(user.id, id);
    if (!attempt) return jsonFail("ATTEMPT_NOT_FOUND", "Attempt not found.", 404);
    return jsonOk(attempt);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
