import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listLicensesForUser } from "@/lib/services/botLicenseService";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot access licenses.", 403);
    }
    const licenses = await listLicensesForUser(user.id);
    return jsonOk(licenses);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail("UNAUTHORIZED", err.message, 401);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
