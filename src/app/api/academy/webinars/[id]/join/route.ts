import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { recordWebinarJoin } from "@/lib/services/academyService";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const user = await requireAuth();
    if (user.role === "PARTNER") return jsonFail("FORBIDDEN", "Partners cannot join webinars.", 403);
    const result = await recordWebinarJoin(user.id, id);
    return jsonOk(result);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    if (err instanceof Error && err.message === "WEBINAR_NOT_FOUND") {
      return jsonFail("WEBINAR_NOT_FOUND", "Webinar not found.", 404);
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
