import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listPublishedProducts } from "@/lib/services/botMarketplaceService";

export async function GET() {
  try {
    const user = await requireAuth();
    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot access the marketplace.", 403);
    }
    const products = await listPublishedProducts();
    return jsonOk(products);
  } catch (err) {
    if (err instanceof AuthError) {
      return jsonFail(err.code, err.message, err.statusCode);
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
