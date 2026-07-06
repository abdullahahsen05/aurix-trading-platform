import { requireAuth, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role !== "PARTNER") return jsonFail("FORBIDDEN", "Partner access required", 403);

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("partner_payouts")
      .select("id, month, total_amount, currency, status, paid_at, admin_note, created_at")
      .eq("partner_id", user.id)
      .order("month", { ascending: false })
      .limit(100);

    if (error) return jsonFail("DB_ERROR", error.message, 500);

    type Row = {
      id: string;
      month: string;
      total_amount: number;
      currency: string;
      status: string;
      paid_at: string | null;
      admin_note: string | null;
      created_at: string;
    };

    const payouts = ((data ?? []) as Row[]).map((p) => ({
      id: p.id,
      month: p.month,
      totalAmount: Number(p.total_amount),
      currency: p.currency,
      status: p.status,
      paidAt: p.paid_at,
      adminNote: p.admin_note,
      createdAt: p.created_at,
    }));

    return jsonOk({ payouts });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Failed to load payouts", 500);
  }
}
