import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { listMySubscriptions } from "@/lib/services/copyTradingService";

export async function GET() {
  try {
    const trader = await requireTrader();
    return jsonOk(await listMySubscriptions(trader.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
