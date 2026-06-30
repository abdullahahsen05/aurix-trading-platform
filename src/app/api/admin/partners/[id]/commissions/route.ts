import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { createCommissionRecord, listCommissionsForPartner } from "@/lib/services/partnerAdminService";
import { commissionCreateSchema } from "@/lib/validation/schemas";
import { PartnerError } from "@/lib/partner/types";

// GET /api/admin/partners/[id]/commissions — list a partner's commission records (admin).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await params;
    return jsonOk(await listCommissionsForPartner(id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

// POST /api/admin/partners/[id]/commissions — create a manual commission/adjustment record.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = commissionCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    const created = await createCommissionRecord(
      id,
      {
        traderId: parsed.data.traderId ?? null,
        sourceType: parsed.data.sourceType,
        grossAmount: parsed.data.grossAmount,
        commissionPercent: parsed.data.commissionPercent,
        commissionAmount: parsed.data.commissionAmount,
        currency: parsed.data.currency,
        periodStart: parsed.data.periodStart ?? null,
        periodEnd: parsed.data.periodEnd ?? null,
        note: parsed.data.note,
      },
      admin.id,
    );
    return jsonOk(created, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof PartnerError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
