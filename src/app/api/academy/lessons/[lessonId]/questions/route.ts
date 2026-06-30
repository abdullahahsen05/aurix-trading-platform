import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { askLessonQuestion } from "@/lib/services/academyService";
import { z } from "zod";

const schema = z.object({
  question: z.string().min(5, "Question must be at least 5 characters").max(2000),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const user = await requireAuth();
    if (user.role === "PARTNER") return jsonFail("FORBIDDEN", "Partners cannot ask questions.", 403);

    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = schema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    const question = await askLessonQuestion(user.id, lessonId, parsed.data.question);
    return jsonOk(question);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
