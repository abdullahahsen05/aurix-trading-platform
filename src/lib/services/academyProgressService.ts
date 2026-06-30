import { createAdminClient } from "@/lib/supabase/admin";
import type { CourseProgressDto } from "@/lib/domain/types";

export async function getCourseProgress(
  userId: string,
  courseId: string
): Promise<CourseProgressDto> {
  const supabase = createAdminClient();

  const [publishedLessons, completedProgress] = await Promise.all([
    supabase
      .from("academy_lessons")
      .select("id, slug", { count: "exact" })
      .eq("course_id", courseId)
      .eq("status", "PUBLISHED"),
    supabase
      .from("academy_lesson_progress")
      .select("lesson_id, last_watched_at, updated_at")
      .eq("user_id", userId)
      .eq("course_id", courseId)
      .eq("status", "COMPLETED")
      .order("updated_at", { ascending: false }),
  ]);

  const total = (publishedLessons.data ?? []).length;
  const completedRows = completedProgress.data ?? [];
  const completed = completedRows.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  // Last touched (any status, IN_PROGRESS or COMPLETED)
  const { data: lastRow } = await supabase
    .from("academy_lesson_progress")
    .select("lesson_id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .order("last_watched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastLessonId = (lastRow as { lesson_id: string } | null)?.lesson_id ?? null;

  let lastLessonSlug: string | null = null;
  let lastCourseSlug: string | null = null;

  if (lastLessonId) {
    const { data: lessonRow } = await supabase
      .from("academy_lessons")
      .select("slug, academy_courses(slug)")
      .eq("id", lastLessonId)
      .maybeSingle();
    if (lessonRow) {
      const lr = lessonRow as Record<string, unknown>;
      lastLessonSlug = lr.slug as string;
      const course = lr.academy_courses as Record<string, unknown> | null;
      lastCourseSlug = (course?.slug as string | null) ?? null;
    }
  }

  return {
    courseId,
    completedLessons: completed,
    totalLessons: total,
    progressPercent: percent,
    lastLessonId,
    lastLessonSlug,
    lastCourseSlug,
  };
}

export async function markLessonStarted(userId: string, lessonId: string): Promise<void> {
  const supabase = createAdminClient();

  // Get course_id for the lesson
  const { data: lesson } = await supabase
    .from("academy_lessons")
    .select("course_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (!lesson) return;

  const courseId = (lesson as { course_id: string }).course_id;

  // Upsert — do not overwrite COMPLETED status
  const { data: existing } = await supabase
    .from("academy_lesson_progress")
    .select("id, status")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("academy_lesson_progress")
      .update({ last_watched_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("academy_lesson_progress").insert({
      user_id: userId,
      course_id: courseId,
      lesson_id: lessonId,
      status: "IN_PROGRESS",
      last_watched_at: new Date().toISOString(),
    });
  }
}

export async function markLessonComplete(userId: string, lessonId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: lesson } = await supabase
    .from("academy_lessons")
    .select("course_id")
    .eq("id", lessonId)
    .maybeSingle();

  if (!lesson) return;

  const courseId = (lesson as { course_id: string }).course_id;
  const now = new Date().toISOString();

  const { data: existing } = await supabase
    .from("academy_lesson_progress")
    .select("id")
    .eq("user_id", userId)
    .eq("lesson_id", lessonId)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("academy_lesson_progress")
      .update({ status: "COMPLETED", completed_at: now, last_watched_at: now })
      .eq("id", (existing as { id: string }).id);
  } else {
    await supabase.from("academy_lesson_progress").insert({
      user_id: userId,
      course_id: courseId,
      lesson_id: lessonId,
      status: "COMPLETED",
      completed_at: now,
      last_watched_at: now,
    });
  }
}

export async function getProgressMapForUser(
  userId: string,
  courseId: string
): Promise<Record<string, "IN_PROGRESS" | "COMPLETED">> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("academy_lesson_progress")
    .select("lesson_id, status")
    .eq("user_id", userId)
    .eq("course_id", courseId);

  const map: Record<string, "IN_PROGRESS" | "COMPLETED"> = {};
  for (const row of data ?? []) {
    const r = row as { lesson_id: string; status: string };
    map[r.lesson_id] = r.status as "IN_PROGRESS" | "COMPLETED";
  }
  return map;
}
