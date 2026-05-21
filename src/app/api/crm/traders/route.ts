import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listTraderProfiles } from "@/lib/services/crmService";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listTraderProfiles());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
