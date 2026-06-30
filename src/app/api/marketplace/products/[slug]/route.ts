import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth } from "@/lib/auth/session";
import { getPublishedProductBySlug, getAccessRecord } from "@/lib/services/botMarketplaceService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await context.params;
    const user = await requireAuth();

    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot access the marketplace.", 403);
    }

    const product = await getPublishedProductBySlug(slug);
    if (!product) return jsonFail("NOT_FOUND", "Product not found.", 404);

    const access = await getAccessRecord(product.id, user.id);
    return jsonOk({ product, access });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
