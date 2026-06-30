import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { adminListAccessRequests } from "@/lib/services/botMarketplaceService";

export async function GET() {
  try {
    await requireAdmin();
    const records = await adminListAccessRequests();
    return jsonOk(records);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
