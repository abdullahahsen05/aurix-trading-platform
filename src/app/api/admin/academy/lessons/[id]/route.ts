import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminUpdateLesson } from "@/lib/services/academyAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const patchSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional(),
  title: z.string().min(1).max(200).optional(),
  summary: z.string().max(1000).optional(),
  content: z.string().max(50000).optional(),
  lessonType: z.enum(["VIDEO", "TEXT", "RESOURCE", "WEBINAR_REPLAY"]).optional(),
  videoUrl: z.string().url().nullable().optional(),
  embedUrl: z.string().url().nullable().optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const admin = await requireAdmin();
    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    const lesson = await adminUpdateLesson(id, parsed.data);
    await writeAuditLog({ actorUserId: admin.id, action: "ACADEMY_LESSON_UPDATED", entityType: "academy_lesson", entityId: id, metadata: { fields: Object.keys(parsed.data) } });
    return jsonOk(lesson);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
