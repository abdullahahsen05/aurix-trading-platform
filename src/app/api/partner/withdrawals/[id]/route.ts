import { AuthError, requirePartner } from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { getPartnerWithdrawal } from "@/lib/services/partnerWithdrawalService";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const partner = await requirePartner();
    const { id } = await context.params;
    const withdrawal = await getPartnerWithdrawal(partner.id, id);
    if (!withdrawal) return jsonFail("NOT_FOUND", "Withdrawal request not found", 404);
    return jsonOk({ withdrawal });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("WITHDRAWAL_ERROR", "Failed to load withdrawal request", 500);
  }
}
