import { NextRequest } from "next/server";
import { AuthError, requirePartner } from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import {
  createPartnerWithdrawal,
  getPartnerWithdrawalBalance,
  listPartnerWithdrawals,
} from "@/lib/services/partnerWithdrawalService";

export async function GET() {
  try {
    const partner = await requirePartner();
    const [balance, withdrawals] = await Promise.all([
      getPartnerWithdrawalBalance(partner.id),
      listPartnerWithdrawals(partner.id),
    ]);
    return jsonOk({ balance, withdrawals });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("WITHDRAWAL_ERROR", "Failed to load withdrawal data", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const partner = await requirePartner();
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const amount = Number(body.amount);
    const payoutMethod = typeof body.payoutMethod === "string" ? body.payoutMethod.trim() : "";
    const payoutReference = typeof body.payoutReference === "string" ? body.payoutReference.trim() : "";
    const requestedNote = typeof body.requestedNote === "string" ? body.requestedNote : null;
    if (!Number.isFinite(amount) || !payoutMethod || !payoutReference) {
      return jsonFail("VALIDATION_ERROR", "Amount, payout method, and payout reference are required", 400);
    }
    const withdrawal = await createPartnerWithdrawal({
      partnerId: partner.id,
      amount,
      currency: typeof body.currency === "string" ? body.currency : "USD",
      payoutMethod,
      payoutReference,
      requestedNote,
    });
    return jsonOk({ withdrawal }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("WITHDRAWAL_REJECTED", error instanceof Error ? error.message : "Withdrawal request failed", 400);
  }
}
