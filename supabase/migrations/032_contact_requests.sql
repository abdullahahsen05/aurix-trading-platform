-- Phase 10: stored mentorship/contact requests.

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'MENTORSHIP' CHECK (type IN ('MENTORSHIP', 'GENERAL')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_status_created
  ON public.contact_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_requests_user_created
  ON public.contact_requests(user_id, created_at DESC);

CREATE OR REPLACE TRIGGER trg_contact_requests_updated_at
  BEFORE UPDATE ON public.contact_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_requests_own_select"
  ON public.contact_requests FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "contact_requests_own_insert"
  ON public.contact_requests FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_active_user());

CREATE POLICY "contact_requests_admin_all"
  ON public.contact_requests FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
