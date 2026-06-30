import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminListCourses, adminCreateCourse } from "@/lib/services/academyAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const createSchema = z.object({
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  title: z.string().min(1).max(200),
  shortDescription: z.string().max(500).optional(),
  description: z.string().max(20000).optional(),
  difficulty: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).optional(),
  estimatedMinutes: z.number().int().min(1).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  coverImageUrl: z.string().url().nullable().optional(),
});

export async function GET() {
  try {
    const admin = await requireAdmin();
    void admin;
    return jsonOk(await adminListCourses());
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

    const course = await adminCreateCourse({ ...parsed.data, createdBy: admin.id });
    await writeAuditLog({ actorUserId: admin.id, action: "ACADEMY_COURSE_CREATED", entityType: "academy_course", entityId: course.id, metadata: { slug: course.slug, title: course.title } });
    return jsonOk(course);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate key") || msg.includes("unique")) return jsonFail("SLUG_CONFLICT", "A course with this slug already exists.", 409);
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
