import { requireAuth } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { getMarketDataProvider } from "@/lib/terminal/marketDataService";

export async function GET(req: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol");
    if (!symbol) return jsonFail("MISSING_PARAM", "symbol query param is required", 400);

    const provider = getMarketDataProvider();
    const heatmap = await provider.getHeatmap(symbol.toUpperCase());
    return jsonOk(heatmap);
  } catch (err) {
    return handleAuthError(err);
  }
}
