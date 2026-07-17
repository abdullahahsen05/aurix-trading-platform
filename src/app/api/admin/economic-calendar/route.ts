import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { createEvent, listEvents } from "@/lib/services/economicCalendarService";
import { writeAuditLog } from "@/lib/services/auditService";
import { economicEventCreateSchema } from "@/lib/validation/schemas";

// POST /api/admin/economic-calendar — create an economic calendar event (admin).
export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(await listEvents());
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const parsed = economicEventCreateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("INVALID_BODY", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const event = await createEvent(parsed.data, admin.id);

    await writeAuditLog({
      actorUserId: admin.id,
      action: "ECONOMIC_EVENT_CREATED",
      entityType: "economic_calendar_event",
      entityId: event.id,
      metadata: { currency: event.currency, impact: event.impact, eventTime: event.eventTime },
    });

    return jsonOk(event, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
