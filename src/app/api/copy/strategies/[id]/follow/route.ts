import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { followStrategy } from "@/lib/services/copyTradingService";
import { copyFollowSchema } from "@/lib/validation/schemas";
import { COPY_ERROR, CopyError } from "@/lib/copy/types";

// POST — trader opts in to a strategy with one of their own accounts. Requires
// explicit consent (consentAccepted must be true).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trader = await requireTrader();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = copyFollowSchema.safeParse(body);
    if (!parsed.success) {
      // A missing/false consent surfaces as a clear consent-required error.
      const consentIssue = parsed.error.issues.find((i) => i.path[0] === "consentAccepted");
      if (consentIssue) return jsonFail(COPY_ERROR.COPY_CONSENT_REQUIRED, "You must accept the risk disclaimer.", 400);
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }
    const result = await followStrategy(trader.id, id, {
      followerAccountId: parsed.data.followerAccountId,
      scalingMode: parsed.data.scalingMode,
      riskMultiplier: parsed.data.riskMultiplier,
      fixedLot: parsed.data.fixedLot,
      maxLot: parsed.data.maxLot,
    });
    return jsonOk(result, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return jsonFail(err.code, err.message, err.statusCode);
    if (err instanceof CopyError) return jsonFail(err.code, err.message, err.statusCode);
    throw err;
  }
}
