import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";

export async function GET() {
  try {
    const user = await requireAuth();
    // Supabase Realtime uses the anon key directly on the client.
    // This endpoint confirms auth is valid for realtime connections.
    return jsonOk({
      userId: user.id,
      role: user.role,
      // Client uses NEXT_PUBLIC_SUPABASE_ANON_KEY for realtime subscriptions
      realtimeUrl: process.env.NEXT_PUBLIC_SUPABASE_URL + "/realtime/v1",
    });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
