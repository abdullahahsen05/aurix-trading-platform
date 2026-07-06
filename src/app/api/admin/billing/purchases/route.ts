import { NextRequest } from "next/server";
import { requireAdmin, AuthError } from "@/lib/auth/session";
import { jsonOk, jsonFail, handleAuthError } from "@/lib/api/envelope";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const supabase = createAdminClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);

    let q = supabase
      .from("payment_orders")
      .select(`
        id, amount, currency, status, created_at, paid_at,
        provider_payment_intent_id, provider_checkout_url,
        trading_account_id, tier, bot_product_id,
        billing_products(code, name, type),
        profiles(full_name, email)
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status) q = q.eq("status", status);

    const { data, error } = await q;
    if (error) return jsonFail("DB_ERROR", error.message, 500);

    type OrderRow = {
      id: string;
      amount: number;
      currency: string;
      status: string;
      created_at: string;
      paid_at: string | null;
      provider_payment_intent_id: string | null;
      provider_checkout_url: string | null;
      trading_account_id: string | null;
      tier: string | null;
      bot_product_id: string | null;
      billing_products: { code: string; name: string; type: string } | null;
      profiles: { full_name: string | null; email: string | null } | null;
    };

    const purchases = ((data ?? []) as unknown as OrderRow[]).map((o) => ({
      id: o.id,
      amount: Number(o.amount),
      currency: o.currency,
      status: o.status,
      createdAt: o.created_at,
      paidAt: o.paid_at,
      intentId: o.provider_payment_intent_id,
      checkoutUrl: o.provider_checkout_url,
      tradingAccountId: o.trading_account_id,
      tier: o.tier,
      botProductId: o.bot_product_id,
      productCode: o.billing_products?.code ?? "",
      productName: o.billing_products?.name ?? "",
      productType: o.billing_products?.type ?? "",
      userName: o.profiles?.full_name ?? o.profiles?.email ?? "Unknown",
      userEmail: o.profiles?.email ?? "",
    }));

    return jsonOk({ purchases });
  } catch (err) {
    if (err instanceof AuthError) return handleAuthError(err);
    return jsonFail("INTERNAL_ERROR", "Failed to load purchases", 500);
  }
}
