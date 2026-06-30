import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminCreateLesson, adminListLessons } from "@/lib/services/academyAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const createSchema = z.object({
  courseId: z.string().uuid(),
  moduleId: z.string().uuid(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  title: z.string().min(1).max(200),
  summary: z.string().max(1000).optional(),
  content: z.string().max(50000).optional(),
  lessonType: z.enum(["VIDEO", "TEXT", "RESOURCE", "WEBINAR_REPLAY"]).optional(),
  videoUrl: z.string().url().nullable().optional(),
  embedUrl: z.string().url().nullable().optional(),
  durationMinutes: z.number().int().min(1).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
});

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    void admin;
    const url = new URL(req.url);
    const courseId = url.searchParams.get("courseId") ?? "";
    if (!courseId) return jsonFail("VALIDATION_ERROR", "courseId query param is required.", 400);
    return jsonOk(await adminListLessons(courseId));
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    const lesson = await adminCreateLesson(parsed.data);
    await writeAuditLog({ actorUserId: admin.id, action: "ACADEMY_LESSON_CREATED", entityType: "academy_lesson", entityId: lesson.id, metadata: { courseId: parsed.data.courseId, slug: lesson.slug } });
    return jsonOk(lesson);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate key") || msg.includes("unique")) return jsonFail("SLUG_CONFLICT", "A lesson with this slug already exists in this course.", 409);
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
