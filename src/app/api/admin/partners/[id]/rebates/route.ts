import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { partnerRebateCreateSchema } from "@/lib/validation/schemas";
import { createPartnerRebate } from "@/lib/services/partnerWithdrawalService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const parsed = partnerRebateCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }
    return jsonOk(await createPartnerRebate({
      partnerId: id,
      actorUserId: admin.id,
      ...parsed.data,
    }), { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("PARTNER_REBATE_CREATE_FAILED", "Partner rebate could not be created.", 500);
  }
}
