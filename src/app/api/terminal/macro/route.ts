import { requireAuth } from "@/lib/auth/session";
import { jsonOk, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";
import type { MacroEvent } from "@/lib/terminal/types";

export async function GET() {
  try {
    await requireAuth();

    const db = createAdminClient();
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 3);

    const { data, error } = await db
      .from("economic_calendar_events")
      .select("id, title, currency, impact, event_time, actual, forecast, previous")
      .gte("event_time", from.toISOString())
      .lte("event_time", to.toISOString())
      .in("impact", ["MEDIUM", "HIGH"])
      .order("event_time", { ascending: true })
      .limit(20);

    if (error) throw error;

    const events: MacroEvent[] = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      currency: row.currency,
      impact: row.impact as "LOW" | "MEDIUM" | "HIGH",
      eventTime: row.event_time,
      actual: row.actual ?? null,
      forecast: row.forecast ?? null,
      previous: row.previous ?? null,
    }));

    return jsonOk(events);
  } catch (err) {
    return handleAuthError(err);
  }
}
