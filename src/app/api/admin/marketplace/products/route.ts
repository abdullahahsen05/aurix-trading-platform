import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { adminListAllProducts, adminCreateProduct } from "@/lib/services/botMarketplaceService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const createSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1).max(200),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(10000).optional(),
  features: z.array(z.string().max(200)).max(20).optional(),
  platform: z.enum(["MT5", "MT4", "BOTH"]).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  priceAmount: z.number().min(0).nullable().optional(),
  priceCurrency: z.string().max(3).optional(),
  pricingLabel: z.string().max(100).nullable().optional(),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).nullable().optional(),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
  screenshotUrls: z.array(z.string().url()).max(8).optional(),
  videoUrl: z.string().url().nullable().optional(),
  version: z.string().max(30).nullable().optional(),
});

export async function GET() {
  try {
    const admin = await requireAdmin();
    void admin;
    const products = await adminListAllProducts();
    return jsonOk(products);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonFail("VALIDATION_ERROR", "Invalid JSON body.", 400);
    }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);
    }

    const product = await adminCreateProduct({ ...parsed.data, createdBy: admin.id });

    await writeAuditLog({
      actorUserId: admin.id,
      action: "BOT_PRODUCT_CREATED",
      entityType: "bot_product",
      entityId: product.id,
      metadata: { slug: product.slug, name: product.name },
    });

    return jsonOk(product);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate key") || msg.includes("unique")) {
      return jsonFail("SLUG_CONFLICT", "A product with this slug already exists.", 409);
    }
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
