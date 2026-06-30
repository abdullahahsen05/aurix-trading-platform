import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { verifyCertificateByVerificationId } from "@/lib/services/certificateService";

// Public — no auth required. Returns only safe fields (no email, no account data).
export async function GET(
  _req: Request,
  context: { params: Promise<{ verificationId: string }> }
) {
  try {
    const { verificationId } = await context.params;
    const cert = await verifyCertificateByVerificationId(verificationId);
    if (!cert) return jsonFail("CERTIFICATE_NOT_FOUND", "Certificate not found.", 404);
    return jsonOk(cert);
  } catch (err) {
    return jsonFail("INTERNAL_ERROR", err instanceof Error ? err.message : "Unknown error", 500);
  }
}
