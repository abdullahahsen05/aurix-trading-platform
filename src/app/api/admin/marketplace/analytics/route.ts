import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { adminGetMarketplaceAnalytics } from "@/lib/services/botMarketplaceService";

export async function GET() {
  try {
    await requireAdmin();
    const analytics = await adminGetMarketplaceAnalytics();
    return jsonOk(analytics);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
