import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminListEvaluationAttempts } from "@/lib/services/evaluationService";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const programId = searchParams.get("programId") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const attempts = await adminListEvaluationAttempts({ programId, status });
    return jsonOk(attempts);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
