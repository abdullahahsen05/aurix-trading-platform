import { requireAuth } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
import type { TerminalPreferences } from "@/lib/terminal/types";

const VALID_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;

const PrefSchema = z.object({
  symbol: z.string().min(1).max(20).optional(),
  timeframe: z.enum(VALID_TIMEFRAMES).optional(),
  layout: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  try {
    const { id: userId } = await requireAuth();
    const db = createAdminClient();

    const { data, error } = await db
      .from("terminal_user_preferences")
      .select("symbol, timeframe, layout")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;

    const prefs: TerminalPreferences = {
      symbol: data?.symbol ?? "EURUSD",
      timeframe: (data?.timeframe as TerminalPreferences["timeframe"]) ?? "1h",
      layout: (data?.layout as Record<string, unknown>) ?? {},
    };

    return jsonOk(prefs);
  } catch (err) {
    return handleAuthError(err);
  }
}

export async function PATCH(req: Request) {
  try {
    const { id: userId } = await requireAuth();
    const body = await req.json();
    const parsed = PrefSchema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation error", 400);

    const db = createAdminClient();
    const { error } = await db.from("terminal_user_preferences").upsert(
      {
        user_id: userId,
        ...(parsed.data.symbol !== undefined && { symbol: parsed.data.symbol.toUpperCase() }),
        ...(parsed.data.timeframe !== undefined && { timeframe: parsed.data.timeframe }),
        ...(parsed.data.layout !== undefined && { layout: parsed.data.layout }),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) throw error;
    return jsonOk({ saved: true });
  } catch (err) {
    return handleAuthError(err);
  }
}
