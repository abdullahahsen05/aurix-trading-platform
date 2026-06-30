import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { getPartnerCommissionSummary, listPartnerCommissions } from "@/lib/services/partnerService";

export async function GET() {
  try {
    const partner = await requirePartner();
    const [summary, records] = await Promise.all([
      getPartnerCommissionSummary(partner.id),
      listPartnerCommissions(partner.id),
    ]);
    return jsonOk({ summary, records });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
