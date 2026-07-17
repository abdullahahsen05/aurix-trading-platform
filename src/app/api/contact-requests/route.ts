import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { ContactRateLimitError, createContactRequest } from "@/lib/services/contactRequestService";
import { contactRequestSchema } from "@/lib/validation/schemas";

export async function POST(request: Request) {
  try {
    const trader = await requireTrader();
    const parsed = contactRequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join(", "), 400);
    return jsonOk(await createContactRequest({ userId: trader.id, ...parsed.data }), { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof ContactRateLimitError) return jsonFail("RATE_LIMITED", err.message, err.statusCode);
    throw err;
  }
}
