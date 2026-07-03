import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  try {
    const user = await requireAuth();
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("ai_user_limits")
      .select("ai_token_credits")
      .eq("user_id", user.id)
      .maybeSingle();
    const credits: number = (data as { ai_token_credits?: number } | null)?.ai_token_credits ?? 50_000;
    return jsonOk({ credits });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
