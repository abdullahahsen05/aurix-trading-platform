import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { brokerServerCreateSchema } from "@/lib/validation/schemas";
import {
  createBrokerServer,
  listBrokerServers,
} from "@/lib/services/brokerCatalogService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    return jsonOk({ servers: await listBrokerServers({ brokerProviderId: id, includeInactive: true }) });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_SERVERS_UNAVAILABLE", "Broker servers are unavailable.", 503);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin();
    const { id } = await context.params;
    const parsed = brokerServerCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }
    return jsonOk(await createBrokerServer({
      brokerProviderId: id,
      ...parsed.data,
      actorUserId: user.id,
    }));
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("not enabled") || message.includes("not found")) {
      return jsonFail("BROKER_SERVER_INVALID", message, 400);
    }
    return jsonFail("BROKER_SERVER_CREATE_FAILED", "Broker server could not be added.", 500);
  }
}
