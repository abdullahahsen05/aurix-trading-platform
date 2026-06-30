import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { listEvents } from "@/lib/services/economicCalendarService";

// GET /api/economic-calendar — readable by any authenticated active user.
export async function GET() {
  try {
    await requireAuth();
    return jsonOk(await listEvents());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
