import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminGetEvaluationAnalytics } from "@/lib/services/evaluationService";

export async function GET() {
  try {
    await requireAdmin();
    const analytics = await adminGetEvaluationAnalytics();
    return jsonOk(analytics);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
