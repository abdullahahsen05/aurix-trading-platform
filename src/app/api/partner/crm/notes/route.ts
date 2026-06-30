import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requirePartner, AuthError } from "@/lib/auth/session";
import { createPartnerNote, listPartnerNotes } from "@/lib/services/partnerService";
import { partnerNoteCreateSchema } from "@/lib/validation/schemas";
import { PartnerError } from "@/lib/partner/types";

// GET /api/partner/crm/notes?traderId=<traderUserId> — partner's own notes for an assigned trader.
export async function GET(request: Request) {
  try {
    const partner = await requirePartner();
    const traderId = new URL(request.url).searchParams.get("traderId");
    if (!traderId) return jsonFail("VALIDATION_ERROR", "traderId is required", 400);
    return jsonOk(await listPartnerNotes(partner.id, traderId));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PartnerError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

// POST /api/partner/crm/notes — create a partner note for an assigned trader.
export async function POST(request: Request) {
  try {
    const partner = await requirePartner();
    const body = await request.json().catch(() => null);
    const parsed = partnerNoteCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    const note = await createPartnerNote({
      partnerUserId: partner.id,
      partnerName: partner.name,
      traderUserId: parsed.data.traderId,
      note: parsed.data.note,
    });
    return jsonOk(note, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PartnerError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
