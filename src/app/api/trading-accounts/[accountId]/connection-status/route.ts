import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { assertCanAccessAccount, AuthError, requireAuth } from "@/lib/auth/session";
import { getBrokerConnectionStatus } from "@/lib/services/brokerSyncService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ accountId: string }> },
) {
  try {
    const { accountId } = await context.params;
    const user = await requireAuth();
    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot access broker connections.", 403);
    }
    await assertCanAccessAccount(accountId);
    return jsonOk(await getBrokerConnectionStatus(accountId));
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("BROKER_STATUS_FAILED", "Broker connection status could not be checked.", 502);
  }
}
