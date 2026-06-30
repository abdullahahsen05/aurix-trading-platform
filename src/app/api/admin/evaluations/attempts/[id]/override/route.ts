import { z } from "zod";
import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminOverrideEvaluationAttempt } from "@/lib/services/evaluationService";

const Schema = z.object({
  newStatus: z.enum(["PASSED", "FAILED", "CANCELLED"]),
  reason: z.string().min(5, "Override reason is required (min 5 characters)"),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json();
    const parsed = Schema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation error", 400);
    }
    const attempt = await adminOverrideEvaluationAttempt(id, {
      ...parsed.data,
      adminUserId: admin.id,
    });
    return jsonOk(attempt);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
