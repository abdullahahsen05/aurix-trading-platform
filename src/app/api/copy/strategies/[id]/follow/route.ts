import { jsonFail, jsonOk } from "@/lib/api/envelope";
import { requireTrader, AuthError } from "@/lib/auth/session";
import { followStrategy } from "@/lib/services/copyTradingService";
import { copyFollowSchema } from "@/lib/validation/schemas";
import { COPY_ERROR, CopyError } from "@/lib/copy/types";
import { getActiveCopyEntitlements, expireStaleEntitlements } from "@/lib/services/billingService";

// POST — trader opts in to a strategy with one of their own accounts. Requires
// explicit consent (consentAccepted must be true) AND an active copy entitlement.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const trader = await requireTrader();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    const parsed = copyFollowSchema.safeParse(body);
    if (!parsed.success) {
      const consentIssue = parsed.error.issues.find((i) => i.path[0] === "consentAccepted");
      if (consentIssue) return jsonFail(COPY_ERROR.COPY_CONSENT_REQUIRED, "You must accept the risk disclaimer.", 400);
      return jsonFail("VALIDATION_ERROR", parsed.error.issues.map((i) => i.message).join(", "), 400);
    }

    // Run expiry check lazily before access check
    await expireStaleEntitlements().catch(() => {});

    // Billing gate: user must have an active copy entitlement
    const entitlements = await getActiveCopyEntitlements(
      trader.id,
      parsed.data.followerAccountId,
    );
    if (entitlements.length === 0) {
      return jsonFail(
        "COPY_ENTITLEMENT_REQUIRED",
        "An active copy-trading entitlement is required. Purchase one from Billing to continue.",
        403,
      );
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
