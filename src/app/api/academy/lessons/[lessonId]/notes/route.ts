import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { saveLessonNote, deleteLessonNote } from "@/lib/services/academyService";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

const noteSchema = z.object({
  note: z.string().min(1, "Note cannot be empty").max(10000),
});

export async function GET(
  _req: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const user = await requireAuth();
    if (user.role === "PARTNER") return jsonFail("FORBIDDEN", "Partners cannot access notes.", 403);

    const supabase = createAdminClient();
    const { data } = await supabase
      .from("academy_lesson_notes")
      .select("note, updated_at")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .maybeSingle();

    return jsonOk({ note: (data as { note: string; updated_at: string } | null)?.note ?? null, savedAt: (data as { note: string; updated_at: string } | null)?.updated_at ?? null });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const user = await requireAuth();
    if (user.role === "PARTNER") return jsonFail("FORBIDDEN", "Partners cannot save notes.", 403);

    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = noteSchema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    const result = await saveLessonNote(user.id, lessonId, parsed.data.note);
    return jsonOk(result);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ lessonId: string }> }
) {
  try {
    const { lessonId } = await context.params;
    const user = await requireAuth();
    if (user.role === "PARTNER") return jsonFail("FORBIDDEN", "Partners cannot delete notes.", 403);
    await deleteLessonNote(user.id, lessonId);
    return jsonOk({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
