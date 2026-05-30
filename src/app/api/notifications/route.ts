import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { listNotifications, getUnreadCount } from "@/lib/services/notificationService";

export async function GET() {
  try {
    const user = await requireTrader();
    const [notifications, unreadCount] = await Promise.all([
      listNotifications(user.id),
      getUnreadCount(user.id),
    ]);
    return jsonOk({ notifications, unreadCount });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
