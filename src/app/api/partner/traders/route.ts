import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { listPartnerTraders } from "@/lib/services/partnerService";
import { partnerTraderFilterSchema } from "@/lib/validation/schemas";

export async function GET(request: Request) {
  try {
    const partner = await requirePartner();
    const parsed = partnerTraderFilterSchema.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    return jsonOk(
      await listPartnerTraders(partner.id, { status: parsed.data.status, search: parsed.data.search }),
    );
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
