import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listRiskRules } from "@/lib/services/riskService";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const accountId = new URL(request.url).searchParams.get("accountId") ?? undefined;
    return jsonOk(await listRiskRules(accountId, user.id, user.role));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
