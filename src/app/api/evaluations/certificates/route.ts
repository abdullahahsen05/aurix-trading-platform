import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getMyCertificates } from "@/lib/services/certificateService";

export async function GET() {
  try {
    const user = await requireAuth();
    const certs = await getMyCertificates(user.id);
    return jsonOk(certs);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
