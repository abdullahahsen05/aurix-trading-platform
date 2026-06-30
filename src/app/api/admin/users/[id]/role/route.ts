import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { setUserRole } from "@/lib/services/partnerAdminService";
import { setUserRoleSchema } from "@/lib/validation/schemas";
import { PartnerError } from "@/lib/partner/types";

// PATCH /api/admin/users/[id]/role — change a user's role (TRADER | ADMIN | PARTNER).
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = setUserRoleSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    await setUserRole(id, parsed.data.role, admin.id);
    return jsonOk({ updated: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PartnerError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
