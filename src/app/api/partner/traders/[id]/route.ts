import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { getPartnerTraderDetail } from "@/lib/services/partnerService";
import { PartnerError } from "@/lib/partner/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const partner = await requirePartner();
    const { id } = await params;
    return jsonOk(await getPartnerTraderDetail(partner.id, id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PartnerError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
