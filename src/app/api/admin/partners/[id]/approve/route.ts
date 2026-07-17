import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { approvePartner } from "@/lib/services/partnerAdminService";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    await approvePartner(id, admin.id);
    return jsonOk({ partnerId: id });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof Error) return jsonFail("SERVER_ERROR", err.message, 500);
    throw err;
  }
}
