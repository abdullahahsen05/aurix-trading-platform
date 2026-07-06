import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await req.json().catch(() => ({})) as { adminNote?: string };
    const supabase = createAdminClient();

    const { data: payout, error: fetchErr } = await supabase
      .from("partner_payouts")
      .select("id, partner_id, status, month, total_amount")
      .eq("id", id)
      .single();

    if (fetchErr || !payout) return jsonFail("NOT_FOUND", "Payout not found", 404);
    if (payout.status === "PAID") return jsonFail("ALREADY_PAID", "Already marked as paid");

    const { error } = await supabase
      .from("partner_payouts")
      .update({
        status: "PAID",
        paid_at: new Date().toISOString(),
        admin_note: body.adminNote ?? null,
      })
      .eq("id", id);

    if (error) return jsonFail("DB_ERROR", error.message, 500);

    // Mark underlying APPROVED commissions for this partner+month as PAID
    await supabase
      .from("partner_commissions")
      .update({ status: "PAID", paid_at: new Date().toISOString() })
      .eq("partner_id", payout.partner_id)
      .eq("payout_month", payout.month)
      .eq("status", "APPROVED");

    await writeAuditLog({
      actorUserId: admin.id,
      action: "PARTNER_PAYOUT_MARKED_PAID",
      entityType: "partner_payout",
      entityId: id,
      metadata: { partnerId: payout.partner_id, month: payout.month, amount: payout.total_amount },
    });

    return jsonOk({ message: "Payout marked as paid" });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Mark-paid failed", 500);
  }
}
