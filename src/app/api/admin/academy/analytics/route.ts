import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminGetAcademyAnalytics } from "@/lib/services/academyAdminService";

export async function GET() {
  try {
    const admin = await requireAdmin();
    void admin;
    return jsonOk(await adminGetAcademyAnalytics());
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
