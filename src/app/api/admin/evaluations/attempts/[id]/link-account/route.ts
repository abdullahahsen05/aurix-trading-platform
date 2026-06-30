import { z } from "zod";
import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminLinkEvaluationAccount } from "@/lib/services/evaluationService";

const Schema = z.object({ tradingAccountId: z.string().uuid() });

export async function PATCH(
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
    const attempt = await adminLinkEvaluationAccount(id, parsed.data.tradingAccountId, admin.id);
    return jsonOk(attempt);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg === "Attempt not found") return jsonFail("ATTEMPT_NOT_FOUND", msg, 404);
    if (msg === "Trading account not found") return jsonFail("ACCOUNT_NOT_FOUND", msg, 404);
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
