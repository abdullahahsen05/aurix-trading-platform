import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { getLessonBySlug } from "@/lib/services/academyService";

export async function GET(
  _req: Request,
  context: { params: Promise<{ courseSlug: string; lessonSlug: string }> }
) {
  try {
    const { courseSlug, lessonSlug } = await context.params;
    const user = await requireAuth();

    const lesson = await getLessonBySlug(user.id, courseSlug, lessonSlug);
    if (!lesson) return jsonFail("LESSON_NOT_FOUND", "Lesson not found.", 404);

    return jsonOk(lesson);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
