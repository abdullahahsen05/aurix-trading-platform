import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { markLessonComplete } from "@/lib/services/academyProgressService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const user = await requireAuth();
    if (user.role === "PARTNER") return jsonFail("FORBIDDEN", "Partners cannot track lesson progress.", 403);
    await markLessonComplete(user.id, lessonId);
    return jsonOk({ completed: true });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
