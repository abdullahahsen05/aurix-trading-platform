import { requireAuth } from "@/lib/auth/session";
import { jsonOk, handleAuthError } from "@/lib/api/envelope";
import { getMarketDataProvider } from "@/lib/terminal/marketDataService";

export async function GET() {
  try {
    await requireAuth();
    const provider = getMarketDataProvider();
    const status = await provider.getStatus();
    return jsonOk(status);
  } catch (err) {
    return handleAuthError(err);
  }
}
