import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const statusSchema = z.object({
  status: z.enum(["PENDING", "CONNECTED", "SYNCING", "DISCONNECTED", "RESTRICTED"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { accountId } = await params;
    const parsed = statusSchema.safeParse(await request.json());
    if (!parsed.success) {
      return jsonFail("INVALID_BODY", parsed.error.issues.map(i => i.message).join("; "), 400);
    }

    const supabase = createAdminClient();
    const { data: updated, error } = await supabase
      .from("trading_accounts")
      .update({ status: parsed.data.status })
      .eq("id", accountId)
      .select("id")
      .maybeSingle();

    if (error) return jsonFail("UPDATE_FAILED", error.message, 500);
    if (!updated) return jsonFail("NOT_FOUND", "Trading account not found", 404);

    void writeAuditLog({
      actorUserId: admin.id,
      action: "ACCOUNT_VERIFIED",
      entityType: "trading_account",
      entityId: accountId,
      metadata: { newStatus: parsed.data.status },
    });

    return jsonOk({ updated: true, status: parsed.data.status });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
