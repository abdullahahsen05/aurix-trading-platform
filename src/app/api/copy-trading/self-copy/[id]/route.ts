import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireTrader } from "@/lib/auth/session";
import { CopyError } from "@/lib/copy/types";
import { selfCopyUpdateSchema } from "@/lib/validation/schemas";
import { updateSelfCopyRelationship } from "@/lib/services/selfCopyService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const trader = await requireTrader();
    const { id } = await context.params;
    const parsed = selfCopyUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }
    await updateSelfCopyRelationship({ traderId: trader.id, id, ...parsed.data });
    return jsonOk({ id, updated: true });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    if (error instanceof CopyError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("SELF_COPY_UPDATE_FAILED", "Self-copy setup could not be updated.", 500);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const trader = await requireTrader();
    const { id } = await context.params;
    await updateSelfCopyRelationship({ traderId: trader.id, id, status: "ARCHIVED" });
    return jsonOk({ id, deleted: true });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    if (error instanceof CopyError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("SELF_COPY_DELETE_FAILED", "Self-copy setup could not be removed.", 500);
  }
}
