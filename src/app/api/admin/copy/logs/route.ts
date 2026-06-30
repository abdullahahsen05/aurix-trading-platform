import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listCopyLogs } from "@/lib/services/copyTradingService";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const strategyId = new URL(request.url).searchParams.get("strategyId") ?? undefined;
    return jsonOk(await listCopyLogs({ strategyId }));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
