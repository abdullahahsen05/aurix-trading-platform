import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AcademyCourseDto,
  AcademyModuleDto,
  AcademyLessonDto,
  AcademyRemarkDto,
  AcademyMaterialDto,
  AcademyQuestionDto,
  AcademyWebinarDto,
} from "@/lib/domain/types";

function rowToCourse(row: Record<string, unknown>, mc = 0, lc = 0): AcademyCourseDto {
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
    moduleCount: mc,
    lessonCount: lc,
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

function rowToWebinar(row: Record<string, unknown>): AcademyWebinarDto {
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
    attended: false,
    createdAt: row.created_at as string,
  };
}

// ── Courses ───────────────────────────────────────────────────

export async function adminListCourses(): Promise<AcademyCourseDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_courses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const courses = (data ?? []) as Record<string, unknown>[];
  if (courses.length === 0) return [];

  const courseIds = courses.map((c) => c.id as string);
  const [mods, lessons] = await Promise.all([
    supabase.from("academy_modules").select("course_id").in("course_id", courseIds),
    supabase.from("academy_lessons").select("course_id").in("course_id", courseIds),
  ]);

  const mc: Record<string, number> = {};
  const lc: Record<string, number> = {};
  for (const r of mods.data ?? []) { const x = r as { course_id: string }; mc[x.course_id] = (mc[x.course_id] ?? 0) + 1; }
  for (const r of lessons.data ?? []) { const x = r as { course_id: string }; lc[x.course_id] = (lc[x.course_id] ?? 0) + 1; }

  return courses.map((c) => rowToCourse(c, mc[c.id as string] ?? 0, lc[c.id as string] ?? 0));
}

export interface AdminCourseInput {
  slug: string;
  title: string;
  shortDescription?: string;
  description?: string;
  difficulty?: AcademyCourseDto["difficulty"];
  estimatedMinutes?: number | null;
  status?: AcademyCourseDto["status"];
  coverImageUrl?: string | null;
  createdBy?: string;
}

export async function adminCreateCourse(input: AdminCourseInput): Promise<AcademyCourseDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_courses")
    .insert({
      slug: input.slug,
      title: input.title,
      short_description: input.shortDescription ?? null,
      description: input.description ?? null,
      difficulty: input.difficulty ?? null,
      estimated_minutes: input.estimatedMinutes ?? null,
      status: input.status ?? "DRAFT",
      cover_image_url: input.coverImageUrl ?? null,
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToCourse(data as Record<string, unknown>);
}

export type AdminCoursePatch = Partial<Omit<AdminCourseInput, "createdBy">>;

export async function adminUpdateCourse(id: string, patch: AdminCoursePatch): Promise<AcademyCourseDto> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.slug !== undefined) update.slug = patch.slug;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.shortDescription !== undefined) update.short_description = patch.shortDescription;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.difficulty !== undefined) update.difficulty = patch.difficulty;
  if (patch.estimatedMinutes !== undefined) update.estimated_minutes = patch.estimatedMinutes;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.coverImageUrl !== undefined) update.cover_image_url = patch.coverImageUrl;

  const { data, error } = await supabase
    .from("academy_courses")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToCourse(data as Record<string, unknown>);
}

// ── Modules ───────────────────────────────────────────────────

export interface AdminModuleInput {
  courseId: string;
  title: string;
  description?: string;
  sortOrder?: number;
  status?: AcademyCourseDto["status"];
}

export async function adminCreateModule(input: AdminModuleInput): Promise<AcademyModuleDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_modules")
    .insert({
      course_id: input.courseId,
      title: input.title,
      description: input.description ?? null,
      sort_order: input.sortOrder ?? 0,
      status: input.status ?? "DRAFT",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    courseId: r.course_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    status: r.status as AcademyModuleDto["status"],
    lessons: [],
  };
}

export async function adminListModules(courseId: string): Promise<AcademyModuleDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_modules")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    courseId: r.course_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    status: r.status as AcademyModuleDto["status"],
    lessons: [],
  }));
}

export type AdminModulePatch = Partial<Omit<AdminModuleInput, "courseId">>;

export async function adminUpdateModule(id: string, patch: AdminModulePatch): Promise<AcademyModuleDto> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.status !== undefined) update.status = patch.status;

  const { data, error } = await supabase
    .from("academy_modules")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    courseId: r.course_id as string,
    title: r.title as string,
    description: (r.description as string | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    status: r.status as AcademyModuleDto["status"],
    lessons: [],
  };
}

// ── Lessons ───────────────────────────────────────────────────

export interface AdminLessonInput {
  courseId: string;
  moduleId: string;
  slug: string;
  title: string;
  summary?: string;
  content?: string;
  lessonType?: AcademyLessonDto["lessonType"];
  videoUrl?: string | null;
  embedUrl?: string | null;
  durationMinutes?: number | null;
  sortOrder?: number;
  status?: AcademyCourseDto["status"];
}

export async function adminCreateLesson(input: AdminLessonInput): Promise<AcademyLessonDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_lessons")
    .insert({
      course_id: input.courseId,
      module_id: input.moduleId,
      slug: input.slug,
      title: input.title,
      summary: input.summary ?? null,
      content: input.content ?? null,
      lesson_type: input.lessonType ?? "VIDEO",
      video_url: input.videoUrl ?? null,
      embed_url: input.embedUrl ?? null,
      duration_minutes: input.durationMinutes ?? null,
      sort_order: input.sortOrder ?? 0,
      status: input.status ?? "DRAFT",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const r = data as Record<string, unknown>;
  return buildLessonDto(r, input.courseId);
}

export type AdminLessonPatch = Partial<Omit<AdminLessonInput, "courseId" | "moduleId">>;

export async function adminUpdateLesson(id: string, patch: AdminLessonPatch): Promise<Record<string, unknown>> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.slug !== undefined) update.slug = patch.slug;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.summary !== undefined) update.summary = patch.summary;
  if (patch.content !== undefined) update.content = patch.content;
  if (patch.lessonType !== undefined) update.lesson_type = patch.lessonType;
  if (patch.videoUrl !== undefined) update.video_url = patch.videoUrl;
  if (patch.embedUrl !== undefined) update.embed_url = patch.embedUrl;
  if (patch.durationMinutes !== undefined) update.duration_minutes = patch.durationMinutes;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.status !== undefined) update.status = patch.status;

  const { data, error } = await supabase
    .from("academy_lessons")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Record<string, unknown>;
}

function buildLessonDto(r: Record<string, unknown>, courseSlugOrId: string): AcademyLessonDto {
  return {
    id: r.id as string,
    courseId: r.course_id as string,
    moduleId: r.module_id as string,
    courseSlug: courseSlugOrId,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    content: (r.content as string | null) ?? null,
    lessonType: r.lesson_type as AcademyLessonDto["lessonType"],
    videoUrl: (r.video_url as string | null) ?? null,
    embedUrl: (r.embed_url as string | null) ?? null,
    durationMinutes: (r.duration_minutes as number | null) ?? null,
    sortOrder: (r.sort_order as number) ?? 0,
    status: r.status as AcademyLessonDto["status"],
    progressStatus: null,
    watchedSeconds: 0,
    remarks: [],
    materials: [],
    questions: [],
    note: null,
    noteSavedAt: null,
  };
}

// ── Admin lesson list ─────────────────────────────────────────

export async function adminListLessons(courseId: string): Promise<AcademyLessonDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_lessons")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => buildLessonDto(r as Record<string, unknown>, courseId));
}

// ── Remarks ───────────────────────────────────────────────────

export interface AdminRemarkInput {
  lessonId: string;
  authorId: string;
  title?: string;
  body: string;
  pinned?: boolean;
  status?: "PUBLISHED" | "HIDDEN";
}

export async function adminAddRemark(input: AdminRemarkInput): Promise<AcademyRemarkDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_instructor_remarks")
    .insert({
      lesson_id: input.lessonId,
      author_id: input.authorId,
      title: input.title ?? null,
      body: input.body,
      pinned: input.pinned ?? false,
      status: input.status ?? "PUBLISHED",
    })
    .select("*, profiles(full_name)")
    .single();
  if (error) throw new Error(error.message);
  return rowToRemark(data as Record<string, unknown>);
}

export async function adminUpdateRemark(
  id: string,
  patch: Partial<Pick<AdminRemarkInput, "title" | "body" | "pinned" | "status">>
): Promise<AcademyRemarkDto> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.body !== undefined) update.body = patch.body;
  if (patch.pinned !== undefined) update.pinned = patch.pinned;
  if (patch.status !== undefined) update.status = patch.status;

  const { data, error } = await supabase
    .from("academy_instructor_remarks")
    .update(update)
    .eq("id", id)
    .select("*, profiles(full_name)")
    .single();
  if (error) throw new Error(error.message);
  return rowToRemark(data as Record<string, unknown>);
}

// ── Materials ─────────────────────────────────────────────────

export interface AdminMaterialInput {
  lessonId: string;
  title: string;
  materialUrl: string;
  materialType?: string;
  sortOrder?: number;
}

export async function adminAddMaterial(input: AdminMaterialInput): Promise<AcademyMaterialDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_lesson_materials")
    .insert({
      lesson_id: input.lessonId,
      title: input.title,
      material_url: input.materialUrl,
      material_type: input.materialType ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToMaterial(data as Record<string, unknown>);
}

export async function adminUpdateMaterial(
  id: string,
  patch: Partial<Pick<AdminMaterialInput, "title" | "materialUrl" | "materialType" | "sortOrder">>
): Promise<AcademyMaterialDto> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.materialUrl !== undefined) update.material_url = patch.materialUrl;
  if (patch.materialType !== undefined) update.material_type = patch.materialType;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { data, error } = await supabase
    .from("academy_lesson_materials")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToMaterial(data as Record<string, unknown>);
}

// ── Questions ─────────────────────────────────────────────────

export async function adminListQuestions(lessonId?: string): Promise<AcademyQuestionDto[]> {
  const supabase = createAdminClient();
  let query = supabase
    .from("academy_lesson_questions")
    .select("*")
    .order("created_at", { ascending: false });

  if (lessonId) query = query.eq("lesson_id", lessonId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToQuestion(r as Record<string, unknown>));
}

export async function adminAnswerQuestion(
  id: string,
  answer: string,
  answeredBy: string
): Promise<AcademyQuestionDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_lesson_questions")
    .update({
      answer,
      answered_by: answeredBy,
      answered_at: new Date().toISOString(),
      status: "ANSWERED",
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToQuestion(data as Record<string, unknown>);
}

export async function adminUpdateQuestionStatus(
  id: string,
  status: "OPEN" | "ANSWERED" | "HIDDEN"
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("academy_lesson_questions")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Webinars ──────────────────────────────────────────────────

export interface AdminWebinarInput {
  courseId?: string | null;
  title: string;
  description?: string;
  startTime: string;
  endTime?: string | null;
  timezone?: string;
  joinUrl?: string | null;
  replayUrl?: string | null;
  zoomMeetingId?: string | null;
  status?: AcademyWebinarDto["status"];
  createdBy?: string;
}

export async function adminCreateWebinar(input: AdminWebinarInput): Promise<AcademyWebinarDto> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_webinars")
    .insert({
      course_id: input.courseId ?? null,
      title: input.title,
      description: input.description ?? null,
      start_time: input.startTime,
      end_time: input.endTime ?? null,
      timezone: input.timezone ?? null,
      join_url: input.joinUrl ?? null,
      replay_url: input.replayUrl ?? null,
      zoom_meeting_id: input.zoomMeetingId ?? null,
      status: input.status ?? "SCHEDULED",
      created_by: input.createdBy ?? null,
    })
    .select("*, academy_courses(title)")
    .single();
  if (error) throw new Error(error.message);
  return rowToWebinar(data as Record<string, unknown>);
}

export type AdminWebinarPatch = Partial<Omit<AdminWebinarInput, "createdBy">>;

export async function adminUpdateWebinar(id: string, patch: AdminWebinarPatch): Promise<AcademyWebinarDto> {
  const supabase = createAdminClient();
  const update: Record<string, unknown> = {};
  if (patch.courseId !== undefined) update.course_id = patch.courseId;
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.startTime !== undefined) update.start_time = patch.startTime;
  if (patch.endTime !== undefined) update.end_time = patch.endTime;
  if (patch.timezone !== undefined) update.timezone = patch.timezone;
  if (patch.joinUrl !== undefined) update.join_url = patch.joinUrl;
  if (patch.replayUrl !== undefined) update.replay_url = patch.replayUrl;
  if (patch.zoomMeetingId !== undefined) update.zoom_meeting_id = patch.zoomMeetingId;
  if (patch.status !== undefined) update.status = patch.status;

  const { data, error } = await supabase
    .from("academy_webinars")
    .update(update)
    .eq("id", id)
    .select("*, academy_courses(title)")
    .single();
  if (error) throw new Error(error.message);
  return rowToWebinar(data as Record<string, unknown>);
}

export async function adminListWebinars(): Promise<AcademyWebinarDto[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("academy_webinars")
    .select("*, academy_courses(title)")
    .order("start_time", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => rowToWebinar(r as Record<string, unknown>));
}

// ── Analytics ─────────────────────────────────────────────────

export async function adminGetAcademyAnalytics(): Promise<{
  totalCourses: number;
  publishedCourses: number;
  totalLessons: number;
  publishedLessons: number;
  totalCompletions: number;
  totalQuestions: number;
  openQuestions: number;
  upcomingWebinars: number;
}> {
  const supabase = createAdminClient();

  const [courses, lessons, progress, questions, webinars] = await Promise.all([
    supabase.from("academy_courses").select("status"),
    supabase.from("academy_lessons").select("status"),
    supabase.from("academy_lesson_progress").select("status"),
    supabase.from("academy_lesson_questions").select("status"),
    supabase
      .from("academy_webinars")
      .select("status")
      .eq("status", "SCHEDULED"),
  ]);

  const courseRows = (courses.data ?? []) as Array<{ status: string }>;
  const lessonRows = (lessons.data ?? []) as Array<{ status: string }>;
  const progressRows = (progress.data ?? []) as Array<{ status: string }>;
  const questionRows = (questions.data ?? []) as Array<{ status: string }>;

  return {
    totalCourses: courseRows.length,
    publishedCourses: courseRows.filter((r) => r.status === "PUBLISHED").length,
    totalLessons: lessonRows.length,
    publishedLessons: lessonRows.filter((r) => r.status === "PUBLISHED").length,
    totalCompletions: progressRows.filter((r) => r.status === "COMPLETED").length,
    totalQuestions: questionRows.length,
    openQuestions: questionRows.filter((r) => r.status === "OPEN").length,
    upcomingWebinars: (webinars.data ?? []).length,
  };
}
