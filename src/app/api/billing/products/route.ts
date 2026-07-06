import { requireAuth, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { getBillingProducts } from "@/lib/services/billingService";

export async function GET() {
  try {
    await requireAuth();
    const products = await getBillingProducts();
    return jsonOk(products);
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("BILLING_ERROR", "Failed to load products", 500);
  }
}
