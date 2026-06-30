import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { updateMySubscription } from "@/lib/services/copyTradingService";
import { copySubscriptionUpdateSchema } from "@/lib/validation/schemas";
import { CopyError } from "@/lib/copy/types";

// PATCH — trader pauses/resumes/revokes or adjusts their own subscription.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trader = await requireTrader();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = copySubscriptionUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    await updateMySubscription(trader.id, id, parsed.data);
    return jsonOk({ updated: true });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof CopyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
