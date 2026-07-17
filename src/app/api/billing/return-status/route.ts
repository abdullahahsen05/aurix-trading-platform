import { NextRequest } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth/session";
import { handleAuthError, jsonFail, jsonOk } from "@/lib/api/envelope";
import { getBillingReturnStatus } from "@/lib/services/billingService";

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const sessionId = searchParams.get("session_id");
    if (!orderId) return jsonFail("MISSING_ORDER_ID", "orderId is required", 400);

    const status = await getBillingReturnStatus(user.id, orderId, sessionId);
    if (!status) return jsonFail("ORDER_NOT_FOUND", "This payment return could not be verified.", 404);
    return jsonOk(status);
  } catch (error) {
    if (error instanceof AuthError) return handleAuthError(error);
    return jsonFail("BILLING_ERROR", "Failed to load payment return status", 500);
  }
}
