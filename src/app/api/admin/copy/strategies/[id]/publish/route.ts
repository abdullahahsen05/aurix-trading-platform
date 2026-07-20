import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { publishWsaStrategy, WsaCopyEngineConfigurationError } from "@/lib/services/wsaCopyEngineService";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    return jsonOk(await publishWsaStrategy(id, admin.id));
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    if (error instanceof WsaCopyEngineConfigurationError) return jsonFail("WSA_ENGINE_NOT_CONFIGURED", error.message, 409);
    return jsonFail("WSA_ENGINE_PUBLISH_FAILED", error instanceof Error ? error.message : "Publishing failed.", 502);
  }
}
