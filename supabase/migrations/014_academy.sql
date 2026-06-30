-- ============================================================
-- AURIX Trading Platform — Migration 014
-- Phase 6: Interactive Trading Academy / LMS
-- Additive + idempotent.
-- ============================================================

-- ── ACADEMY_COURSES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_courses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              TEXT UNIQUE NOT NULL,
  title             TEXT NOT NULL,
  short_description TEXT NULL,
  description       TEXT NULL,
  difficulty        TEXT NULL CHECK (difficulty IS NULL OR difficulty IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  estimated_minutes INTEGER NULL,
  status            TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  cover_image_url   TEXT NULL,
  created_by        UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_courses_status ON public.academy_courses(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academy_courses_slug   ON public.academy_courses(slug);

CREATE OR REPLACE TRIGGER trg_academy_courses_updated_at
  BEFORE UPDATE ON public.academy_courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_courses_admin_all"
  ON public.academy_courses FOR ALL
  USING (public.is_admin());

CREATE POLICY "academy_courses_published_read"
  ON public.academy_courses FOR SELECT
  USING (status = 'PUBLISHED' AND public.is_active_user() AND NOT public.is_admin());

-- ── ACADEMY_MODULES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_modules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_academy_modules_course ON public.academy_modules(course_id, sort_order);

CREATE OR REPLACE TRIGGER trg_academy_modules_updated_at
  BEFORE UPDATE ON public.academy_modules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_modules_admin_all"
  ON public.academy_modules FOR ALL
  USING (public.is_admin());

CREATE POLICY "academy_modules_published_read"
  ON public.academy_modules FOR SELECT
  USING (
    status = 'PUBLISHED'
    AND public.is_active_user()
    AND NOT public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.academy_courses c
      WHERE c.id = course_id AND c.status = 'PUBLISHED'
    )
  );

-- ── ACADEMY_LESSONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_lessons (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id        UUID NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  module_id        UUID NOT NULL REFERENCES public.academy_modules(id) ON DELETE CASCADE,
  slug             TEXT NOT NULL,
  title            TEXT NOT NULL,
  summary          TEXT NULL,
  content          TEXT NULL,
  lesson_type      TEXT NOT NULL DEFAULT 'VIDEO' CHECK (lesson_type IN ('VIDEO', 'TEXT', 'RESOURCE', 'WEBINAR_REPLAY')),
  video_url        TEXT NULL,
  embed_url        TEXT NULL,
  duration_minutes INTEGER NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_academy_lessons_course  ON public.academy_lessons(course_id, module_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_academy_lessons_status  ON public.academy_lessons(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academy_lessons_module  ON public.academy_lessons(module_id, sort_order);

CREATE OR REPLACE TRIGGER trg_academy_lessons_updated_at
  BEFORE UPDATE ON public.academy_lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_lessons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy_lessons_admin_all"
  ON public.academy_lessons FOR ALL
  USING (public.is_admin());

CREATE POLICY "academy_lessons_published_read"
  ON public.academy_lessons FOR SELECT
  USING (
    status = 'PUBLISHED'
    AND public.is_active_user()
    AND NOT public.is_admin()
    AND EXISTS (
      SELECT 1 FROM public.academy_courses c
      WHERE c.id = course_id AND c.status = 'PUBLISHED'
    )
  );

-- ── ACADEMY_LESSON_PROGRESS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_lesson_progress (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id       UUID NOT NULL REFERENCES public.academy_courses(id) ON DELETE CASCADE,
  lesson_id       UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  completed_at    TIMESTAMPTZ NULL,
  last_watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_course ON public.academy_lesson_progress(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_lesson ON public.academy_lesson_progress(user_id, lesson_id);

CREATE OR REPLACE TRIGGER trg_lesson_progress_updated_at
  BEFORE UPDATE ON public.academy_lesson_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_lesson_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lesson_progress_admin_all"
  ON public.academy_lesson_progress FOR ALL
  USING (public.is_admin());

CREATE POLICY "lesson_progress_own_all"
  ON public.academy_lesson_progress FOR ALL
  USING (user_id = auth.uid() AND public.is_active_user() AND NOT public.is_admin());

-- ── ACADEMY_LESSON_NOTES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_lesson_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lesson_id  UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_notes_user_lesson ON public.academy_lesson_notes(user_id, lesson_id);

CREATE OR REPLACE TRIGGER trg_lesson_notes_updated_at
  BEFORE UPDATE ON public.academy_lesson_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_lesson_notes ENABLE ROW LEVEL SECURITY;

-- Notes are strictly private — admin cannot read other users' notes in this phase
CREATE POLICY "lesson_notes_own_all"
  ON public.academy_lesson_notes FOR ALL
  USING (user_id = auth.uid() AND public.is_active_user());

-- ── ACADEMY_INSTRUCTOR_REMARKS ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_instructor_remarks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id  UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  author_id  UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  title      TEXT NULL,
  body       TEXT NOT NULL,
  pinned     BOOLEAN NOT NULL DEFAULT FALSE,
  status     TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('PUBLISHED', 'HIDDEN')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_remarks_lesson_pinned ON public.academy_instructor_remarks(lesson_id, pinned, created_at DESC);

CREATE OR REPLACE TRIGGER trg_remarks_updated_at
  BEFORE UPDATE ON public.academy_instructor_remarks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_instructor_remarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "remarks_admin_all"
  ON public.academy_instructor_remarks FOR ALL
  USING (public.is_admin());

CREATE POLICY "remarks_published_read"
  ON public.academy_instructor_remarks FOR SELECT
  USING (status = 'PUBLISHED' AND public.is_active_user() AND NOT public.is_admin());

-- ── ACADEMY_LESSON_MATERIALS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_lesson_materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id     UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  material_url  TEXT NOT NULL,
  material_type TEXT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_materials_lesson_order ON public.academy_lesson_materials(lesson_id, sort_order);

CREATE OR REPLACE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON public.academy_lesson_materials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_lesson_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "materials_admin_all"
  ON public.academy_lesson_materials FOR ALL
  USING (public.is_admin());

CREATE POLICY "materials_active_read"
  ON public.academy_lesson_materials FOR SELECT
  USING (public.is_active_user() AND NOT public.is_admin());

-- ── ACADEMY_LESSON_QUESTIONS ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_lesson_questions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   UUID NOT NULL REFERENCES public.academy_lessons(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question    TEXT NOT NULL,
  answer      TEXT NULL,
  answered_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at TIMESTAMPTZ NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'ANSWERED', 'HIDDEN')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_lesson_status ON public.academy_lesson_questions(lesson_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_questions_user          ON public.academy_lesson_questions(user_id, created_at DESC);

CREATE OR REPLACE TRIGGER trg_questions_updated_at
  BEFORE UPDATE ON public.academy_lesson_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_lesson_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "questions_admin_all"
  ON public.academy_lesson_questions FOR ALL
  USING (public.is_admin());

-- Trader can read/insert their own questions (non-HIDDEN)
CREATE POLICY "questions_own_read"
  ON public.academy_lesson_questions FOR SELECT
  USING (user_id = auth.uid() AND status != 'HIDDEN' AND public.is_active_user() AND NOT public.is_admin());

CREATE POLICY "questions_own_insert"
  ON public.academy_lesson_questions FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'OPEN'
    AND public.is_active_user()
    AND NOT public.is_admin()
  );

-- ── ACADEMY_WEBINARS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_webinars (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id      UUID NULL REFERENCES public.academy_courses(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT NULL,
  start_time     TIMESTAMPTZ NOT NULL,
  end_time       TIMESTAMPTZ NULL,
  timezone       TEXT NULL,
  join_url       TEXT NULL,
  replay_url     TEXT NULL,
  zoom_meeting_id TEXT NULL,
  status         TEXT NOT NULL DEFAULT 'SCHEDULED' CHECK (status IN ('SCHEDULED', 'LIVE', 'COMPLETED', 'CANCELLED')),
  created_by     UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webinars_status_time ON public.academy_webinars(status, start_time);

CREATE OR REPLACE TRIGGER trg_webinars_updated_at
  BEFORE UPDATE ON public.academy_webinars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academy_webinars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webinars_admin_all"
  ON public.academy_webinars FOR ALL
  USING (public.is_admin());

CREATE POLICY "webinars_active_read"
  ON public.academy_webinars FOR SELECT
  USING (public.is_active_user() AND NOT public.is_admin() AND status != 'CANCELLED');

-- ── ACADEMY_WEBINAR_ATTENDANCE ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_webinar_attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webinar_id UUID NOT NULL REFERENCES public.academy_webinars(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (webinar_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_attendance_user    ON public.academy_webinar_attendance(user_id, webinar_id);
CREATE INDEX IF NOT EXISTS idx_attendance_webinar ON public.academy_webinar_attendance(webinar_id);

ALTER TABLE public.academy_webinar_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "attendance_admin_all"
  ON public.academy_webinar_attendance FOR ALL
  USING (public.is_admin());

CREATE POLICY "attendance_own_read"
  ON public.academy_webinar_attendance FOR SELECT
  USING (user_id = auth.uid() AND public.is_active_user() AND NOT public.is_admin());

CREATE POLICY "attendance_own_insert"
  ON public.academy_webinar_attendance FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_active_user() AND NOT public.is_admin());
