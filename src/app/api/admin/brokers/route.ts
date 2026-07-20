import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { brokerProviderCreateSchema } from "@/lib/validation/schemas";
import {
  createBrokerProvider,
  listBrokerProviders,
} from "@/lib/services/brokerCatalogService";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk({
      providers: await listBrokerProviders({ includeInactive: true }),
      discoveryAvailable: false,
      sourceLabel: "Admin-configured catalog",
    });
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_CATALOG_UNAVAILABLE", "Broker catalog is unavailable.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const parsed = brokerProviderCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    }
    return jsonOk(await createBrokerProvider({ ...parsed.data, actorUserId: user.id }));
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_PROVIDER_CREATE_FAILED", "Broker provider could not be created.", 500);
  }
}
