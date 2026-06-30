import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { issueCertificateForPassedAttempt } from "@/lib/services/certificateService";
import { getMyEvaluationAttemptDetail } from "@/lib/services/evaluationService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;
    // Ownership check — trader can only issue for their own passed attempt
    const attempt = await getMyEvaluationAttemptDetail(user.id, id);
    if (!attempt) return jsonFail("ATTEMPT_NOT_FOUND", "Attempt not found.", 404);
    if (attempt.status !== "PASSED") {
      return jsonFail("EVALUATION_NOT_PASSED", "Certificate can only be issued for passed evaluations.", 400);
    }
    try {
      const cert = await issueCertificateForPassedAttempt(id, user.id);
      return jsonOk(cert, { status: 201 });
    } catch (svcErr) {
      const msg = svcErr instanceof Error ? svcErr.message : "Unknown";
      if (msg === "CERTIFICATE_ALREADY_EXISTS") {
        return jsonFail("CERTIFICATE_ALREADY_EXISTS", "A certificate has already been issued for this attempt.", 409);
      }
      throw svcErr;
    }
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
