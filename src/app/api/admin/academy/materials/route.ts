import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminAddMaterial } from "@/lib/services/academyAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const schema = z.object({
  lessonId: z.string().uuid(),
  title: z.string().min(1).max(200),
  materialUrl: z.string().url(),
  materialType: z.string().max(50).optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    const material = await adminAddMaterial(parsed.data);
    await writeAuditLog({ actorUserId: admin.id, action: "ACADEMY_MATERIAL_ADDED", entityType: "academy_material", entityId: material.id, metadata: { lessonId: parsed.data.lessonId } });
    return jsonOk(material);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
