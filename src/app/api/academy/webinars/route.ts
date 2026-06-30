import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listWebinars } from "@/lib/services/academyService";

export async function GET() {
  try {
    const user = await requireAuth();
    const webinars = await listWebinars(user.id);
    return jsonOk(webinars);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
