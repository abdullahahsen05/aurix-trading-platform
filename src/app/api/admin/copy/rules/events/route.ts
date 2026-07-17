import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { listCopyRuleEvents } from "@/lib/services/copyTradingService";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const rawLimit = Number(new URL(request.url).searchParams.get("limit") ?? 50);
    const limit = Number.isFinite(rawLimit) ? rawLimit : 50;
    return jsonOk(await listCopyRuleEvents(limit));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
