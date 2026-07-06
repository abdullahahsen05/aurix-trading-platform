import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const partnerId = searchParams.get("partnerId");
    const month = searchParams.get("month");

    let q = supabase
      .from("partner_commissions")
      .select(`
        id, commission_amount, gross_amount, commission_percent,
        currency, status, source_type, payout_month, created_at, paid_at,
        partner:profiles!partner_id(full_name, email),
        trader:profiles!trader_id(full_name, email)
      `)
      .order("created_at", { ascending: false })
      .limit(500);

    if (status) q = q.eq("status", status);
    if (partnerId) q = q.eq("partner_id", partnerId);
    if (month) q = q.eq("payout_month", month);

    const { data, error } = await q;
    if (error) return jsonFail("DB_ERROR", error.message, 500);

    type CommissionRow = {
      id: string;
      commission_amount: number;
      gross_amount: number;
      commission_percent: number;
      currency: string;
      status: string;
      source_type: string;
      payout_month: string | null;
      created_at: string;
      paid_at: string | null;
      partner: { full_name: string | null; email: string | null } | null;
      trader: { full_name: string | null; email: string | null } | null;
    };

    const commissions = ((data ?? []) as unknown as CommissionRow[]).map((c) => ({
      id: c.id,
      commissionAmount: Number(c.commission_amount),
      grossAmount: Number(c.gross_amount),
      commissionPercent: Number(c.commission_percent),
      currency: c.currency,
      status: c.status,
      sourceType: c.source_type,
      payoutMonth: c.payout_month,
      createdAt: c.created_at,
      paidAt: c.paid_at,
      partnerName: c.partner?.full_name ?? c.partner?.email ?? "Unknown",
      traderName: c.trader?.full_name ?? c.trader?.email ?? "Unknown",
    }));

    return jsonOk({ commissions });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Failed to load commissions", 500);
  }
}
