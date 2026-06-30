import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { listActiveStrategiesForTrader } from "@/lib/services/copyTradingService";

// Trader-visible active strategies (requireTrader blocks PARTNER).
export async function GET() {
  try {
    await requireTrader();
    return jsonOk(await listActiveStrategiesForTrader());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
