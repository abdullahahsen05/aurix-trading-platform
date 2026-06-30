import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { listPartnerRiskEvents } from "@/lib/services/partnerService";

export async function GET() {
  try {
    const partner = await requirePartner();
    return jsonOk(await listPartnerRiskEvents(partner.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
