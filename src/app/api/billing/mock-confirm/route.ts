import { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { handleAuthError, jsonFail, jsonOk } from "@/lib/api/envelope";
import { confirmMockPayment } from "@/lib/services/billingService";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = (await req.json()) as { orderId?: string };

    if (!body.orderId) {
      return jsonFail("MISSING_FIELD", "orderId is required", 400);
    }

    const result = await confirmMockPayment(user.id, body.orderId);
    if (!result.ok) {
      return jsonFail("MOCK_CONFIRM_ERROR", result.message, 400);
    }

    return jsonOk({ message: result.message });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const message = err instanceof Error ? err.message : "Mock payment confirmation failed";
    return jsonFail("MOCK_CONFIRM_ERROR", message, 500);
  }
}
