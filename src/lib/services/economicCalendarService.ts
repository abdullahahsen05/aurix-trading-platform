import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Economic Calendar Service (server-only)
//
// Reads are server-side via the admin client (the table is readable by any
// active user per RLS; using the admin client here is consistent with other
// services such as getDailyPnl). Writes are admin-gated at the route layer.
// ─────────────────────────────────────────────────────────────────────────────

export type EconomicImpact = "LOW" | "MEDIUM" | "HIGH";

export interface EconomicEventDto {
  id: string;
  title: string;
  countryCode: string | null;
  currency: string;
  impact: EconomicImpact;
  eventTime: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string | null;
  description: string | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
}

interface EventRow {
  id: string;
  title: string;
  country_code: string | null;
  currency: string;
  impact: EconomicImpact;
  event_time: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  source: string | null;
  description: string | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  "id, title, country_code, currency, impact, event_time, actual, forecast, previous, source, description, category, created_at, updated_at";

function mapEvent(row: EventRow): EconomicEventDto {
  return {
    id: row.id,
    title: row.title,
    countryCode: row.country_code,
    currency: row.currency,
    impact: row.impact,
    eventTime: row.event_time,
    actual: row.actual,
    forecast: row.forecast,
    previous: row.previous,
    source: row.source,
    description: row.description,
    category: row.category,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Upcoming events for a set of currencies within a time window.
 * Used to build AI news-context for a trader's active pairs.
 */
export async function listUpcomingEvents(params: {
  currencies: string[];
  fromIso: string;
  toIso: string;
  impacts?: EconomicImpact[];
  limit?: number;
}): Promise<EconomicEventDto[]> {
  if (params.currencies.length === 0) return [];
  const supabase = createAdminClient();

  let query = supabase
    .from("economic_calendar_events")
    .select(SELECT_COLS)
    .in("currency", params.currencies)
    .gte("event_time", params.fromIso)
    .lte("event_time", params.toIso)
    .order("event_time", { ascending: true })
    .limit(params.limit ?? 50);

  if (params.impacts && params.impacts.length > 0) {
    query = query.in("impact", params.impacts);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Failed to fetch economic events: ${error.message}`);
  return (data ?? []).map(mapEvent);
}

/**
 * Full list for the admin management page (most recent / upcoming first).
 */
export async function listEvents(limit = 200): Promise<EconomicEventDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("economic_calendar_events")
    .select(SELECT_COLS)
    .order("event_time", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch economic events: ${error.message}`);
  return (data ?? []).map(mapEvent);
}

export interface EconomicEventInput {
  title: string;
  countryCode?: string | null;
  currency: string;
  impact: EconomicImpact;
  eventTime: string;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
  source?: string | null;
  description?: string | null;
  category?: string | null;
}

export async function createEvent(input: EconomicEventInput): Promise<EconomicEventDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("economic_calendar_events")
    .insert({
      title: input.title,
      country_code: input.countryCode ?? null,
      currency: input.currency,
      impact: input.impact,
      event_time: input.eventTime,
      actual: input.actual ?? null,
      forecast: input.forecast ?? null,
      previous: input.previous ?? null,
      source: input.source ?? null,
      description: input.description ?? null,
      category: input.category ?? null,
    })
    .select(SELECT_COLS)
    .single();
  if (error || !data) throw new Error(`Failed to create economic event: ${error?.message}`);
  return mapEvent(data);
}

export async function updateEvent(
  id: string,
  input: Partial<EconomicEventInput>,
): Promise<EconomicEventDto> {
  const supabase = createAdminClient();
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = input.title;
  if (input.countryCode !== undefined) patch.country_code = input.countryCode;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.impact !== undefined) patch.impact = input.impact;
  if (input.eventTime !== undefined) patch.event_time = input.eventTime;
  if (input.actual !== undefined) patch.actual = input.actual;
  if (input.forecast !== undefined) patch.forecast = input.forecast;
  if (input.previous !== undefined) patch.previous = input.previous;
  if (input.source !== undefined) patch.source = input.source;
  if (input.description !== undefined) patch.description = input.description;
  if (input.category !== undefined) patch.category = input.category;

  const { data, error } = await supabase
    .from("economic_calendar_events")
    .update(patch)
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error || !data) throw new Error(`Failed to update economic event: ${error?.message}`);
  return mapEvent(data);
}

export async function deleteEvent(id: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("economic_calendar_events").delete().eq("id", id);
  if (error) throw new Error(`Failed to delete economic event: ${error.message}`);
}
