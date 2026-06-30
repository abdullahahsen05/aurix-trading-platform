import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { assignTraderToPartner } from "@/lib/services/partnerAdminService";
import { assignPartnerSchema } from "@/lib/validation/schemas";
import { PartnerError } from "@/lib/partner/types";

// PATCH /api/admin/traders/[id]/partner — assign/unassign a trader (by user id) to a partner.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = assignPartnerSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    await assignTraderToPartner(id, parsed.data.partnerId, admin.id);
    return jsonOk({ updated: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PartnerError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
