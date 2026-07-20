import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAuth } from "@/lib/auth/session";
import { listBrokerProviders, type BrokerPlatform } from "@/lib/services/brokerCatalogService";

export async function GET(request: Request) {
  try {
    await requireAuth();
    const value = new URL(request.url).searchParams.get("platform")?.toUpperCase();
    if (value !== "MT4" && value !== "MT5") {
      return jsonFail("INVALID_PLATFORM", "Platform must be MT4 or MT5.", 400);
    }
    return jsonOk({
      providers: await listBrokerProviders({ platform: value as BrokerPlatform }),
      source: "ADMIN_CONFIGURED",
      sourceLabel: "Configured broker catalog",
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_CATALOG_UNAVAILABLE", "Broker catalog is unavailable.", 503);
  }
}
