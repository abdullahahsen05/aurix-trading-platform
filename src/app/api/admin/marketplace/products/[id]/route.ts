import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { adminUpdateProduct } from "@/lib/services/botMarketplaceService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const patchSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  name: z.string().min(1).max(200).optional(),
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

export async function PATCH(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonFail("VALIDATION_ERROR", "Invalid JSON body.", 400);
    }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);
    }

    const product = await adminUpdateProduct(id, parsed.data);

    await writeAuditLog({
      actorUserId: admin.id,
      action: "BOT_PRODUCT_UPDATED",
      entityType: "bot_product",
      entityId: id,
      metadata: { fields: Object.keys(parsed.data) },
    });

    return jsonOk(product);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
