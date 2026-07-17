import { NextRequest } from "next/server";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { listAdminWithdrawals } from "@/lib/services/partnerWithdrawalService";
import type { PartnerWithdrawalStatus } from "@/lib/partner/withdrawals";

const STATUSES = new Set(["PENDING_REVIEW", "APPROVED", "PAID", "REJECTED"]);

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const rawStatus = new URL(req.url).searchParams.get("status");
    if (rawStatus && !STATUSES.has(rawStatus)) return jsonFail("VALIDATION_ERROR", "Invalid status", 400);
    return jsonOk({ withdrawals: await listAdminWithdrawals(rawStatus as PartnerWithdrawalStatus | undefined) });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("WITHDRAWAL_ERROR", "Failed to load withdrawal requests", 500);
  }
}
