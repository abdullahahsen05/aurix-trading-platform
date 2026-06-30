import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminUpdateModule } from "@/lib/services/academyAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const schema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();
    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    const module_ = await adminUpdateModule(id, parsed.data);
    await writeAuditLog({ actorUserId: admin.id, action: "ACADEMY_MODULE_UPDATED", entityType: "academy_module", entityId: id, metadata: { fields: Object.keys(parsed.data) } });
    return jsonOk(module_);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
