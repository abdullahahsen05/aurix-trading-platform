import { requireAuth } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { getMarketDataProvider } from "@/lib/terminal/marketDataService";
import type { Timeframe } from "@/lib/terminal/types";

const VALID_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export async function GET(req: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    const timeframe = searchParams.get("timeframe") as Timeframe | null;
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

    if (!symbol) return jsonFail("MISSING_PARAM", "symbol query param is required", 400);
    if (!timeframe || !VALID_TIMEFRAMES.includes(timeframe)) {
      return jsonFail("INVALID_PARAM", `timeframe must be one of: ${VALID_TIMEFRAMES.join(", ")}`, 400);
    }

    const provider = getMarketDataProvider();
    const candles = await provider.getCandles(symbol.toUpperCase(), timeframe, limit);
    return jsonOk(candles);
  } catch (err) {
    return handleAuthError(err);
  }
}
