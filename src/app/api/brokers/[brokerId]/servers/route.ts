import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAuth } from "@/lib/auth/session";
import { listBrokerServers, type BrokerPlatform } from "@/lib/services/brokerCatalogService";

export async function GET(
  request: Request,
  context: { params: Promise<{ brokerId: string }> },
) {
  try {
    await requireAuth();
    const { brokerId } = await context.params;
    const value = new URL(request.url).searchParams.get("platform")?.toUpperCase();
    if (value !== "MT4" && value !== "MT5") {
      return jsonFail("INVALID_PLATFORM", "Platform must be MT4 or MT5.", 400);
    }
    return jsonOk({
      servers: await listBrokerServers({
        brokerProviderId: brokerId,
        platform: value as BrokerPlatform,
      }),
      source: "ADMIN_CONFIGURED",
      sourceLabel: "Configured broker servers",
      refreshedAt: null,
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_SERVERS_UNAVAILABLE", "Configured broker servers are unavailable.", 503);
  }
}
