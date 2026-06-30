import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listPublishedCourses } from "@/lib/services/academyService";
import { getCourseProgress } from "@/lib/services/academyProgressService";

export async function GET() {
  try {
    const user = await requireAuth();
    const courses = await listPublishedCourses();

    // Attach progress for each course
    const withProgress = await Promise.all(
      courses.map(async (course) => {
        const progress = await getCourseProgress(user.id, course.id);
        return { ...course, progress };
      })
    );

    return jsonOk(withProgress);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
