import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { getWsaCopyEngineRuntimeStatus } from "@/lib/services/wsaCopyEngineService";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(getWsaCopyEngineRuntimeStatus());
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    throw error;
  }
}
