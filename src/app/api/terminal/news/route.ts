import { requireAuth } from "@/lib/auth/session";
import { jsonOk, handleAuthError } from "@/lib/api/envelope";
import { getMarketDataProvider } from "@/lib/terminal/marketDataService";

export async function GET(req: Request) {
  try {
    await requireAuth();
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get("symbol") ?? undefined;

    const provider = getMarketDataProvider();
    const news = await provider.getNews(symbol?.toUpperCase());
    return jsonOk(news);
  } catch (err) {
    return handleAuthError(err);
  }
}
