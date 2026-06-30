import { jsonFail, jsonOk, handleAuthError } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { adminListWebinars, adminCreateWebinar } from "@/lib/services/academyAdminService";
import { writeAuditLog } from "@/lib/services/auditService";
import { z } from "zod";

const createSchema = z.object({
  courseId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }).nullable().optional(),
  timezone: z.string().max(50).optional(),
  joinUrl: z.string().url().nullable().optional(),
  replayUrl: z.string().url().nullable().optional(),
  zoomMeetingId: z.string().max(100).nullable().optional(),
  status: z.enum(["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export async function GET() {
  try {
    const admin = await requireAdmin();
    void admin;
    return jsonOk(await adminListWebinars());
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    let body: unknown;
    try { body = await req.json(); } catch { return jsonFail("VALIDATION_ERROR", "Invalid JSON.", 400); }
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Validation failed.", 400);

    const webinar = await adminCreateWebinar({ ...parsed.data, createdBy: admin.id });
    await writeAuditLog({ actorUserId: admin.id, action: "ACADEMY_WEBINAR_CREATED", entityType: "academy_webinar", entityId: webinar.id, metadata: { title: webinar.title, startTime: webinar.startTime } });
    return jsonOk(webinar);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return jsonFail("INTERNAL_ERROR", msg, 500);
  }
}
