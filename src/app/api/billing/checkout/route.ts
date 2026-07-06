import { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createCheckoutSession, checkExistingAccess } from "@/lib/services/billingService";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = (await req.json()) as {
      productCode: string;
      tradingAccountId?: string;
      tier?: string;
      botProductId?: string;
    };

    if (!body.productCode) return jsonFail("MISSING_FIELD", "productCode is required");

    // Duplicate purchase prevention
    const existing = await checkExistingAccess(user.id, body.productCode, {
      tradingAccountId: body.tradingAccountId,
      botProductId: body.botProductId,
    });
    if (existing.status !== "NONE" && existing.status !== "EXPIRED" && existing.status !== "CANCELLED" && existing.status !== "FAILED") {
      return jsonFail("DUPLICATE_PURCHASE", existing.message, 409);
    }

    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const returnUrl = `${origin}/billing/return`;

    const result = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      productCode: body.productCode,
      tradingAccountId: body.tradingAccountId,
      tier: body.tier,
      botProductId: body.botProductId,
      returnUrl,
    });

    return jsonOk(result);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    const msg = err instanceof Error ? err.message : "Checkout failed";
    return jsonFail("CHECKOUT_ERROR", msg, 500);
  }
}
