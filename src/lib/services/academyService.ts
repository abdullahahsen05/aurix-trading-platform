import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AcademyCourseDto,
  AcademyModuleDto,
  AcademyLessonDto,
  AcademyWebinarDto,
  AcademyRemarkDto,
  AcademyMaterialDto,
  AcademyQuestionDto,
  AcademyLessonSummaryDto,
} from "@/lib/domain/types";
import { getProgressMapForUser } from "./academyProgressService";

// ── Row mappers ───────────────────────────────────────────────

function rowToCourse(
  row: Record<string, unknown>,
  moduleCount = 0,
  lessonCount = 0
): AcademyCourseDto {
  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    shortDescription: (row.short_description as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    difficulty: (row.difficulty as AcademyCourseDto["difficulty"]) ?? null,
    estimatedMinutes: (row.estimated_minutes as number | null) ?? null,
    status: row.status as AcademyCourseDto["status"],
    coverImageUrl: (row.cover_image_url as string | null) ?? null,
    moduleCount,
    lessonCount,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToRemark(row: Record<string, unknown>): AcademyRemarkDto {
  const profile = row.profiles as Record<string, unknown> | null;
  return {
    id: row.id as string,
    lessonId: row.lesson_id as string,
    authorName: (profile?.full_name as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    body: row.body as string,
    pinned: Boolean(row.pinned),
    createdAt: row.created_at as string,
  };
}

function rowToMaterial(row: Record<string, unknown>): AcademyMaterialDto {
  return {
    id: row.id as string,
    lessonId: row.lesson_id as string,
    title: row.title as string,
    materialUrl: row.material_url as string,
    materialType: (row.material_type as string | null) ?? null,
    sortOrder: (row.sort_order as number) ?? 0,
  };
}

function rowToQuestion(row: Record<string, unknown>): AcademyQuestionDto {
  return {
    id: row.id as string,
    lessonId: row.lesson_id as string,
    userId: row.user_id as string,
    question: row.question as string,
    answer: (row.answer as string | null) ?? null,
    answeredAt: (row.answered_at as string | null) ?? null,
    status: row.status as AcademyQuestionDto["status"],
    createdAt: row.created_at as string,
  };
}

// ── Courses ───────────────────────────────────────────────────

export async function listPublishedCourses(): Promise<AcademyCourseDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_courses")
    .select("*")
    .eq("status", "PUBLISHED")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const courses = (data ?? []) as Record<string, unknown>[];

  // Count published modules and lessons per course
  const courseIds = courses.map((c) => c.id as string);
  if (courseIds.length === 0) return [];

  const [moduleCounts, lessonCounts] = await Promise.all([
    supabase
      .from("academy_modules")
      .select("course_id")
      .in("course_id", courseIds)
      .eq("status", "PUBLISHED"),
    supabase
      .from("academy_lessons")
      .select("course_id")
      .in("course_id", courseIds)
      .eq("status", "PUBLISHED"),
  ]);

  const mCount: Record<string, number> = {};
  const lCount: Record<string, number> = {};
  for (const row of moduleCounts.data ?? []) {
    const r = row as { course_id: string };
    mCount[r.course_id] = (mCount[r.course_id] ?? 0) + 1;
  }
  for (const row of lessonCounts.data ?? []) {
    const r = row as { course_id: string };
    lCount[r.course_id] = (lCount[r.course_id] ?? 0) + 1;
  }

  return courses.map((c) =>
    rowToCourse(c, mCount[c.id as string] ?? 0, lCount[c.id as string] ?? 0)
  );
}

export async function getPublishedCourseBySlug(
  userId: string,
  slug: string
): Promise<{
  course: AcademyCourseDto;
  modules: AcademyModuleDto[];
} | null> {
  const supabase = createAdminClient();

  const { data: courseRow, error } = await supabase
    .from("academy_courses")
    .select("*")
    .eq("slug", slug)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  if (error || !courseRow) return null;

  const course = courseRow as Record<string, unknown>;
  const courseId = course.id as string;

  // Modules + lessons
  const { data: moduleRows } = await supabase
    .from("academy_modules")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "PUBLISHED")
    .order("sort_order", { ascending: true });

  const { data: lessonRows } = await supabase
    .from("academy_lessons")
    .select("*")
    .eq("course_id", courseId)
    .eq("status", "PUBLISHED")
    .order("sort_order", { ascending: true });

  const lessonList = (lessonRows ?? []) as Record<string, unknown>[];
  const totalLessons = lessonList.length;

  // Count published modules & lessons for course header
  const moduleList = (moduleRows ?? []) as Record<string, unknown>[];

  const progressMap = await getProgressMapForUser(userId, courseId);

  const modules: AcademyModuleDto[] = moduleList.map((m) => {
    const moduleId = m.id as string;
    const moduleLessons = lessonList
      .filter((l) => l.module_id === moduleId)
      .map((l): AcademyLessonSummaryDto => ({
        id: l.id as string,
        slug: l.slug as string,
        title: l.title as string,
        lessonType: l.lesson_type as AcademyLessonSummaryDto["lessonType"],
        durationMinutes: (l.duration_minutes as number | null) ?? null,
        sortOrder: (l.sort_order as number) ?? 0,
        status: l.status as AcademyLessonSummaryDto["status"],
        progressStatus: progressMap[l.id as string] ?? null,
      }));

    return {
      id: moduleId,
      courseId,
      title: m.title as string,
      description: (m.description as string | null) ?? null,
      sortOrder: (m.sort_order as number) ?? 0,
      status: m.status as AcademyModuleDto["status"],
      lessons: moduleLessons,
    };
  });

  return {
    course: rowToCourse(course, moduleList.length, totalLessons),
    modules,
  };
}

export async function getLessonBySlug(
  userId: string,
  courseSlug: string,
  lessonSlug: string
): Promise<AcademyLessonDto | null> {
  const supabase = createAdminClient();

  // Get course
  const { data: courseRow } = await supabase
    .from("academy_courses")
    .select("id, slug")
    .eq("slug", courseSlug)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  if (!courseRow) return null;
  const c = courseRow as { id: string; slug: string };

  // Get lesson
  const { data: lessonRow } = await supabase
    .from("academy_lessons")
    .select("*")
    .eq("course_id", c.id)
    .eq("slug", lessonSlug)
    .eq("status", "PUBLISHED")
    .maybeSingle();

  if (!lessonRow) return null;
  const l = lessonRow as Record<string, unknown>;

  // Parallel: remarks, materials, questions, progress, note
  const [remarksRes, materialsRes, questionsRes, progressRes, noteRes] = await Promise.all([
    supabase
      .from("academy_instructor_remarks")
      .select("*, profiles(full_name)")
      .eq("lesson_id", l.id as string)
      .eq("status", "PUBLISHED")
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("academy_lesson_materials")
      .select("*")
      .eq("lesson_id", l.id as string)
      .order("sort_order", { ascending: true }),
    supabase
      .from("academy_lesson_questions")
      .select("*")
      .eq("lesson_id", l.id as string)
      .eq("user_id", userId)
      .neq("status", "HIDDEN")
      .order("created_at", { ascending: true }),
    supabase
      .from("academy_lesson_progress")
      .select("status, watched_seconds")
      .eq("user_id", userId)
      .eq("lesson_id", l.id as string)
      .maybeSingle(),
    supabase
      .from("academy_lesson_notes")
      .select("note, updated_at")
      .eq("user_id", userId)
      .eq("lesson_id", l.id as string)
      .maybeSingle(),
  ]);

  const progressRow = progressRes.data as { status: string; watched_seconds: number } | null;
  const noteRow = noteRes.data as { note: string; updated_at: string } | null;

  return {
    id: l.id as string,
    courseId: c.id,
    moduleId: l.module_id as string,
    courseSlug: c.slug,
    slug: l.slug as string,
    title: l.title as string,
    summary: (l.summary as string | null) ?? null,
    content: (l.content as string | null) ?? null,
    lessonType: l.lesson_type as AcademyLessonDto["lessonType"],
    videoUrl: (l.video_url as string | null) ?? null,
    embedUrl: (l.embed_url as string | null) ?? null,
    durationMinutes: (l.duration_minutes as number | null) ?? null,
    sortOrder: (l.sort_order as number) ?? 0,
    status: l.status as AcademyLessonDto["status"],
    progressStatus: (progressRow?.status as AcademyLessonDto["progressStatus"]) ?? null,
    watchedSeconds: progressRow?.watched_seconds ?? 0,
    remarks: (remarksRes.data ?? []).map((r) => rowToRemark(r as Record<string, unknown>)),
    materials: (materialsRes.data ?? []).map((r) => rowToMaterial(r as Record<string, unknown>)),
    questions: (questionsRes.data ?? []).map((r) => rowToQuestion(r as Record<string, unknown>)),
    note: noteRow?.note ?? null,
    noteSavedAt: noteRow?.updated_at ?? null,
  };
}

// ── Notes ─────────────────────────────────────────────────────

export async function saveLessonNote(
  userId: string,
  lessonId: string,
  note: string
): Promise<{ savedAt: string }> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("academy_lesson_notes")
    .select("id")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing) {
    await supabase
      .from("academy_lesson_notes")
      .update({ note, updated_at: now })
      .eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("academy_lesson_notes").insert({
      user_id: userId,
      lesson_id: lessonId,
      note,
    });
  }

  return { savedAt: now };
}

export async function deleteLessonNote(userId: string, lessonId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("academy_lesson_notes")
    .delete()
    .eq("user_id", userId)
    .eq("lesson_id", lessonId);
}

// ── Questions ─────────────────────────────────────────────────

export async function askLessonQuestion(
  userId: string,
  lessonId: string,
  question: string
): Promise<AcademyQuestionDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_lesson_questions")
    .insert({ lesson_id: lessonId, user_id: userId, question })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToQuestion(data as Record<string, unknown>);
}

// ── Webinars ──────────────────────────────────────────────────

export async function listWebinars(userId: string): Promise<AcademyWebinarDto[]> {
  const supabase = createAdminClient();

  const [webinarsRes, attendanceRes] = await Promise.all([
    supabase
      .from("academy_webinars")
      .select("*, academy_courses(title)")
      .neq("status", "CANCELLED")
      .order("start_time", { ascending: true }),
    supabase
      .from("academy_webinar_attendance")
      .select("webinar_id")
      .eq("user_id", userId),
  ]);

  const attended = new Set(
    (attendanceRes.data ?? []).map((r) => (r as { webinar_id: string }).webinar_id)
  );

  return (webinarsRes.data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    const course = row.academy_courses as Record<string, unknown> | null;
    return {
      id: row.id as string,
      courseId: (row.course_id as string | null) ?? null,
      courseTitle: (course?.title as string | null) ?? null,
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      startTime: row.start_time as string,
      endTime: (row.end_time as string | null) ?? null,
      timezone: (row.timezone as string | null) ?? null,
      joinUrl: (row.join_url as string | null) ?? null,
      replayUrl: (row.replay_url as string | null) ?? null,
      zoomMeetingId: (row.zoom_meeting_id as string | null) ?? null,
      status: row.status as AcademyWebinarDto["status"],
      attended: attended.has(row.id as string),
      createdAt: row.created_at as string,
    };
  });
}

export async function recordWebinarJoin(
  userId: string,
  webinarId: string
): Promise<{ attended: boolean }> {
  const supabase = createAdminClient();

  // Check webinar exists
  const { data: webinar } = await supabase
    .from("academy_webinars")
    .select("id, status")
    .eq("id", webinarId)
    .maybeSingle();

  if (!webinar) throw new Error("WEBINAR_NOT_FOUND");

  // Upsert attendance (idempotent)
  await supabase
    .from("academy_webinar_attendance")
    .upsert(
      { webinar_id: webinarId, user_id: userId, joined_at: new Date().toISOString() },
      { onConflict: "webinar_id,user_id", ignoreDuplicates: true }
    );

  return { attended: true };
}
