import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { getPartnerSummary } from "@/lib/services/partnerService";

export async function GET() {
  try {
    const partner = await requirePartner();
    return jsonOk(await getPartnerSummary(partner.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
