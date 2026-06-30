import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminListCertificates } from "@/lib/services/certificateService";

export async function GET() {
  try {
    await requireAdmin();
    const certs = await adminListCertificates();
    return jsonOk(certs);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
