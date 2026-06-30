import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listPartners } from "@/lib/services/partnerAdminService";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listPartners());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
