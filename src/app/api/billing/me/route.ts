import { requireAuth, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { getUserBillingSummary } from "@/lib/services/billingService";

export async function GET() {
  try {
    const user = await requireAuth();
    const summary = await getUserBillingSummary(user.id);
    return jsonOk(summary);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("BILLING_ERROR", "Failed to load billing summary", 500);
  }
}
