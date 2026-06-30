import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);
    const offset = Number(url.searchParams.get("offset") ?? "0");

    const supabase = createAdminClient();
    const { data, error, count } = await supabase
      .from("bot_license_verification_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return jsonFail("INTERNAL_ERROR", error.message, 500);
    return jsonOk({ rows: data ?? [], total: count ?? 0, limit, offset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
