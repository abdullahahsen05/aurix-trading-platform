import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { getDailyPnl } from "@/lib/services/tradeService";

export async function GET() {
  try {
    const user = await requireTrader();
    return jsonOk(await getDailyPnl(user.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
