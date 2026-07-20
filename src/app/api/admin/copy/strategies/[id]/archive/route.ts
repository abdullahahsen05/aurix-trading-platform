import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { AuthError, requireAdmin } from "@/lib/auth/session";
import { archiveWsaStrategy } from "@/lib/services/wsaCopyEngineService";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    return jsonOk(await archiveWsaStrategy(id, admin.id));
  } catch (error) {
    if (error instanceof AuthError) return jsonFail(error.code, error.message, error.statusCode);
    return jsonFail("WSA_ENGINE_ARCHIVE_FAILED", error instanceof Error ? error.message : "Archiving failed.", 502);
  }
}
