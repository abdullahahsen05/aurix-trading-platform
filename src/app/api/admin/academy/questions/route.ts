import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminListQuestions } from "@/lib/services/academyAdminService";

export async function GET(req: Request) {
  try {
    const admin = await requireAdmin();
    void admin;
    const url = new URL(req.url);
    const lessonId = url.searchParams.get("lessonId") ?? undefined;
    return jsonOk(await adminListQuestions(lessonId));
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
