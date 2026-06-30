import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, handleAuthError } from "@/lib/api/envelope";
import { getMarketDataProvider } from "@/lib/terminal/marketDataService";

export async function POST() {
  try {
    await requireAdmin();
    const provider = getMarketDataProvider();
    const status = await provider.getStatus();
    return jsonOk(status);
  } catch (err) {
    return handleAuthError(err);
  }
}
