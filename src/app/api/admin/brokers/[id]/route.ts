import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { brokerProviderUpdateSchema } from "@/lib/validation/schemas";
import { updateBrokerProvider } from "@/lib/services/brokerCatalogService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin();
    const { id } = await context.params;
    const parsed = brokerProviderUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }
    await updateBrokerProvider({ id, patch: parsed.data, actorUserId: user.id });
    return jsonOk({ id, updated: true });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_PROVIDER_UPDATE_FAILED", "Broker provider could not be updated.", 500);
  }
}
