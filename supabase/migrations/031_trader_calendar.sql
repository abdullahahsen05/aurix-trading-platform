-- Phase 8: extend the existing economic calendar into the shared admin/trader calendar.

ALTER TABLE public.economic_calendar_events
  ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'ECONOMIC',
  ADD COLUMN IF NOT EXISTS location_url TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.economic_calendar_events
  DROP CONSTRAINT IF EXISTS economic_calendar_events_status_check,
  ADD CONSTRAINT economic_calendar_events_status_check
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED')),
  DROP CONSTRAINT IF EXISTS economic_calendar_events_audience_check,
  ADD CONSTRAINT economic_calendar_events_audience_check
    CHECK (audience IN ('ALL', 'TRADER')),
  DROP CONSTRAINT IF EXISTS economic_calendar_events_event_type_check,
  ADD CONSTRAINT economic_calendar_events_event_type_check
    CHECK (event_type IN ('ECONOMIC', 'WEBINAR', 'ACADEMY', 'PLATFORM', 'OTHER')),
  DROP CONSTRAINT IF EXISTS economic_calendar_events_time_check,
  ADD CONSTRAINT economic_calendar_events_time_check
    CHECK (end_time IS NULL OR end_time >= event_time);

CREATE INDEX IF NOT EXISTS idx_economic_calendar_publication
  ON public.economic_calendar_events(status, audience, event_time);

DROP POLICY IF EXISTS "economic_calendar_select" ON public.economic_calendar_events;
DROP POLICY IF EXISTS "economic_calendar_admin_write" ON public.economic_calendar_events;

CREATE POLICY "economic_calendar_select"
  ON public.economic_calendar_events FOR SELECT
  USING (
    public.is_admin()
    OR (
      status = 'PUBLISHED'
      AND audience IN ('ALL', 'TRADER')
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'TRADER' AND status = 'ACTIVE'
      )
    )
  );

CREATE POLICY "economic_calendar_admin_write"
  ON public.economic_calendar_events FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
