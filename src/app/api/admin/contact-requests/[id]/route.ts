import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { updateContactRequestStatus } from "@/lib/services/contactRequestService";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const parsed = z.object({ status: z.enum(["NEW", "IN_PROGRESS", "RESOLVED", "CLOSED"]) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success || !z.string().uuid().safeParse(id).success) return jsonFail("VALIDATION_ERROR", "A valid request and status are required", 400);
    return jsonOk(await updateContactRequestStatus(id, parsed.data.status, admin.id));
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
