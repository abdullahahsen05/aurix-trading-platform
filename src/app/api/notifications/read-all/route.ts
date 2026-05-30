import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { markAllNotificationsRead } from "@/lib/services/notificationService";

export async function PATCH() {
  try {
    const user = await requireAuth();
    await markAllNotificationsRead(user.id);
    return jsonOk({ cleared: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
