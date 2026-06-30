import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listUserAccessRecords } from "@/lib/services/botMarketplaceService";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot access my-bots.", 403);
    }
    const records = await listUserAccessRecords(user.id);
    return jsonOk(records);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail("UNAUTHORIZED", err.message, 401);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
