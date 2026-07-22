import { NextRequest } from "next/server";
import { requireAuth, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import {
  canCreateCheckoutForState,
  checkExistingAccess,
  createCheckoutSession,
  getProductByCode,
  resumePendingCheckoutSession,
} from "@/lib/services/billingService";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const body = (await req.json()) as {
      productCode: string;
      tradingAccountId?: string;
      tier?: string;
      botProductId?: string;
      copyStrategyId?: string;
    };

    if (!body.productCode) return jsonFail("MISSING_FIELD", "productCode is required");

    const product = await getProductByCode(body.productCode);
    if (!product) return jsonFail("PRODUCT_NOT_FOUND", "Product not found or inactive", 404);

    // Duplicate purchase prevention
    const existing = await checkExistingAccess(user.id, body.productCode, {
      tradingAccountId: body.tradingAccountId,
      botProductId: body.botProductId,
      copyStrategyId: body.copyStrategyId,
    });
    if (existing.status === "PENDING_PAYMENT") {
      const pendingCheckout = await resumePendingCheckoutSession({
        userId: user.id,
        productId: product.id,
        tradingAccountId: body.tradingAccountId,
        copyStrategyId: body.copyStrategyId,
        botProductId: body.botProductId,
      });
      if (pendingCheckout) return jsonOk(pendingCheckout);
    }
    if (!canCreateCheckoutForState(existing.status, product.billingInterval === "MONTHLY")) {
      if (existing.status === "PENDING_PAYMENT") {
        // The previous order had no usable checkout session and was released
        // above, so creating a fresh Checkout is safe.
      } else {
        return jsonFail("DUPLICATE_PURCHASE", existing.message, 409);
      }
    }

    const origin = req.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const returnUrl = `${origin}/billing/return`;

    const result = await createCheckoutSession({
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      productCode: body.productCode,
      tradingAccountId: body.tradingAccountId,
      copyStrategyId: body.copyStrategyId,
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
