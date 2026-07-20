import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { brokerServerUpdateSchema } from "@/lib/validation/schemas";
import { updateBrokerServer } from "@/lib/services/brokerCatalogService";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ serverId: string }> },
) {
  try {
    const user = await requireAdmin();
    const { serverId } = await context.params;
    const parsed = brokerServerUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }
    await updateBrokerServer({ id: serverId, patch: parsed.data, actorUserId: user.id });
    return jsonOk({ id: serverId, updated: true });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_SERVER_UPDATE_FAILED", "Broker server could not be updated.", 500);
  }
}
