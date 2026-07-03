import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, AuthError } from "@/lib/auth/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ ok: false, error: { message: err.message } }, { status: err.statusCode });
    throw err;
  }

  const { id: strategyId } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("copy_strategy_followers")
    .select(
      "id, follower_account_id, trader_id, status, tier, scaling_mode, risk_multiplier, fixed_lot, max_lot, consent_accepted_at, created_at, trading_accounts(account_name)",
    )
    .eq("strategy_id", strategyId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });
  }

  const mapped = (data ?? []).map((f: any) => ({
    id: f.id,
    followerAccountId: f.follower_account_id,
    followerAccountName: f.trading_accounts?.account_name ?? null,
    traderId: f.trader_id,
    status: f.status,
    tier: (f.tier ?? "NORMAL") as "NORMAL" | "PREMIUM",
    scalingMode: f.scaling_mode,
    riskMultiplier: f.risk_multiplier,
    fixedLot: f.fixed_lot,
    maxLot: f.max_lot,
    consentAcceptedAt: f.consent_accepted_at,
    createdAt: f.created_at,
  }));

  mapped.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === "PREMIUM" ? -1 : 1));

  return NextResponse.json({ ok: true, data: mapped });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ ok: false, error: { message: err.message } }, { status: err.statusCode });
    throw err;
  }

  const { id: strategyId } = await params;
  const body = await req.json().catch(() => ({}));
  const { followerId, tier } = body as { followerId?: string; tier?: string };

  if (!followerId || !["NORMAL", "PREMIUM"].includes(tier ?? "")) {
    return NextResponse.json(
      { ok: false, error: { message: "followerId and tier (NORMAL|PREMIUM) are required" } },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("copy_strategy_followers")
    .update({ tier, updated_at: new Date().toISOString() })
    .eq("id", followerId)
    .eq("strategy_id", strategyId);

  if (error) {
    return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data: { followerId, tier } });
}
