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

    const { data: sub, error: fetchErr } = await supabase
      .from("subscriptions")
      .select("id, user_id, status")
      .eq("id", id)
      .single();

    if (fetchErr || !sub) return jsonFail("NOT_FOUND", "Subscription not found", 404);
    if (sub.status === "CANCELLED") return jsonFail("ALREADY_CANCELLED", "Already cancelled");

    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "CANCELLED", cancelled_at: new Date().toISOString() })
      .eq("id", id);

    if (error) return jsonFail("DB_ERROR", error.message, 500);

    await writeAuditLog({
      actorUserId: admin.id,
      action: "SUBSCRIPTION_CANCELLED",
      entityType: "subscription",
      entityId: id,
      metadata: { userId: sub.user_id },
    });

    return jsonOk({ message: "Subscription cancelled" });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Cancel failed", 500);
  }
}
