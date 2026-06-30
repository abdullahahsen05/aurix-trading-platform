import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateCommissionStatus } from "@/lib/services/partnerAdminService";
import { commissionStatusSchema } from "@/lib/validation/schemas";
import { PartnerError } from "@/lib/partner/types";

// PATCH /api/admin/partner-commissions/[id]/status — PENDING → APPROVED → PAID / CANCELLED.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = commissionStatusSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("INVALID_STATUS", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    await updateCommissionStatus(id, parsed.data.status, admin.id);
    return jsonOk({ updated: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PartnerError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
