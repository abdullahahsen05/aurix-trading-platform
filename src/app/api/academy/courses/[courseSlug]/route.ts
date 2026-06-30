import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getPublishedCourseBySlug } from "@/lib/services/academyService";
import { getCourseProgress } from "@/lib/services/academyProgressService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ courseSlug: string }> }
) {
  try {
    const { courseSlug: slug } = await context.params;
    const user = await requireAuth();

    const result = await getPublishedCourseBySlug(user.id, slug);
    if (!result) return jsonFail("COURSE_NOT_FOUND", "Course not found.", 404);

    const progress = await getCourseProgress(user.id, result.course.id);
    return jsonOk({ ...result, progress });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
