import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { deleteEvent, updateEvent } from "@/lib/services/economicCalendarService";
import { writeAuditLog } from "@/lib/services/auditService";
import { economicEventUpdateSchema } from "@/lib/validation/schemas";

// PATCH /api/admin/economic-calendar/[id] — update an event (admin).
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = await request.json();
    const parsed = economicEventUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("INVALID_BODY", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    const event = await updateEvent(id, parsed.data);

    await writeAuditLog({
      actorUserId: admin.id,
      action: "ECONOMIC_EVENT_UPDATED",
      entityType: "economic_calendar_event",
      entityId: id,
      metadata: { fields: Object.keys(parsed.data) },
    });

    return jsonOk(event);
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}

// DELETE /api/admin/economic-calendar/[id] — delete an event (admin).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    await deleteEvent(id);

    await writeAuditLog({
      actorUserId: admin.id,
      action: "ECONOMIC_EVENT_DELETED",
      entityType: "economic_calendar_event",
      entityId: id,
      metadata: {},
    });

    return jsonOk({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
