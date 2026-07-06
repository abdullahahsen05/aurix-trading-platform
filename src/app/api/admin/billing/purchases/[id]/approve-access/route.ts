import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { approvePaymentAccess } from "@/lib/services/billingService";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const result = await approvePaymentAccess(id, admin.id);
    if (!result.ok) return jsonFail("APPROVAL_ERROR", result.message, 400);
    return jsonOk({ message: result.message });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Approval failed", 500);
  }
}
