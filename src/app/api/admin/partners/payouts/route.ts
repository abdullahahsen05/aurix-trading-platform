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

    let q = supabase
      .from("partner_payouts")
      .select(`
        id, month, total_amount, currency, status, paid_at, admin_note, created_at,
        partner:profiles!partner_id(full_name, email)
      `)
      .order("month", { ascending: false })
      .limit(200);

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return jsonFail("DB_ERROR", error.message, 500);

    type PayoutRow = {
      id: string;
      month: string;
      total_amount: number;
      currency: string;
      status: string;
      paid_at: string | null;
      admin_note: string | null;
      created_at: string;
      partner: { full_name: string | null; email: string | null } | null;
    };

    const payouts = ((data ?? []) as unknown as PayoutRow[]).map((p) => ({
      id: p.id,
      month: p.month,
      totalAmount: Number(p.total_amount),
      currency: p.currency,
      status: p.status,
      paidAt: p.paid_at,
      adminNote: p.admin_note,
      createdAt: p.created_at,
      partnerName: p.partner?.full_name ?? p.partner?.email ?? "Unknown",
    }));

    return jsonOk({ payouts });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Failed to load payouts", 500);
  }
}
