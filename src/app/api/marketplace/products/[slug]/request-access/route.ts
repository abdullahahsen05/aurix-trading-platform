import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { requestAccess } from "@/lib/services/botMarketplaceService";
import { writeAuditLog } from "@/lib/services/auditService";
import { createAdminClient } from "@/lib/supabase/admin";

// The [slug] param here receives the product UUID (not a human slug).
// The frontend posts to /api/marketplace/products/${product.id}/request-access.
export async function POST(
  _req: Request,
  context: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug: productId } = await context.params;
    const user = await requireAuth();

    if (user.role === "PARTNER") {
      return jsonFail("FORBIDDEN", "Partners cannot request bot access.", 403);
    }

    const supabase = createAdminClient();
    const { data: product, error } = await supabase
      .from("bot_products")
      .select("id, name, status")
      .eq("id", productId)
      .maybeSingle();

    if (error || !product) return jsonFail("NOT_FOUND", "Product not found.", 404);
    if (product.status !== "PUBLISHED") {
      return jsonFail("NOT_FOUND", "Product not found.", 404);
    }

    const access = await requestAccess(productId, user.id);

    await writeAuditLog({
      actorUserId: user.id,
      action: "BOT_ACCESS_REQUESTED",
      entityType: "bot_access_record",
      entityId: access.id,
      metadata: { productId, productName: product.name },
    });

    return jsonOk(access);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail("UNAUTHORIZED", err.message, 401);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
