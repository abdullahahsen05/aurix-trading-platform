import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: commission, error: fetchErr } = await supabase
      .from("partner_commissions")
      .select("id, partner_id, status")
      .eq("id", id)
      .single();

    if (fetchErr || !commission) return jsonFail("NOT_FOUND", "Commission not found", 404);
    if (commission.status !== "PENDING")
      return jsonFail("INVALID_STATUS", "Commission must be PENDING to approve");

    const { error } = await supabase
      .from("partner_commissions")
      .update({ status: "APPROVED" })
      .eq("id", id);

    if (error) return jsonFail("DB_ERROR", error.message, 500);

    await writeAuditLog({
      actorUserId: admin.id,
      action: "PARTNER_COMMISSION_APPROVED",
      entityType: "partner_commission",
      entityId: id,
      metadata: { partnerId: commission.partner_id },
    });

    return jsonOk({ message: "Commission approved" });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Approval failed", 500);
  }
}
