import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getMyEvaluationAttempts } from "@/lib/services/evaluationService";

export async function GET() {
  try {
    const user = await requireAuth();
    const attempts = await getMyEvaluationAttempts(user.id);
    return jsonOk(attempts);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
