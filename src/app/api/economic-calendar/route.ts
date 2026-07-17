import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { listPublishedEvents } from "@/lib/services/economicCalendarService";

// GET /api/economic-calendar — readable by any authenticated active user.
export async function GET() {
  try {
    await requireTrader();
    return jsonOk(await listPublishedEvents());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
