import { NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { transitionPartnerWithdrawal } from "@/lib/services/partnerWithdrawalService";

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json().catch(() => ({})) as { adminNote?: string };
    return jsonOk({ withdrawal: await transitionPartnerWithdrawal({ withdrawalId: id, adminId: admin.id, nextStatus: "PAID", adminNote: body.adminNote }) });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("WITHDRAWAL_ACTION_FAILED", error instanceof Error ? error.message : "Mark-paid failed", 400);
  }
}
