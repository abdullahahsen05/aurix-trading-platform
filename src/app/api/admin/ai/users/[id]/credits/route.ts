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

  const { id: userId } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("ai_user_limits")
    .select("ai_token_credits")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({ ok: true, data: { userId, ai_token_credits: data?.ai_token_credits ?? 50000 } });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ ok: false, error: { message: err.message } }, { status: err.statusCode });
    throw err;
  }

  const { id: userId } = await params;
  const body = await req.json().catch(() => ({}));
  const { amount, mode } = body as { amount?: number; mode?: string };

  if (typeof amount !== "number" || amount < 0 || !["add", "set"].includes(mode ?? "")) {
    return NextResponse.json(
      { ok: false, error: { message: "amount (number ≥ 0) and mode ('add'|'set') are required" } },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  if (mode === "set") {
    const { error } = await supabase
      .from("ai_user_limits")
      .upsert({ user_id: userId, ai_token_credits: amount }, { onConflict: "user_id" });
    if (error) return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });
  } else {
    const { error } = await supabase.rpc("topup_ai_credits", { p_user_id: userId, p_tokens: amount });
    if (error) return NextResponse.json({ ok: false, error: { message: error.message } }, { status: 500 });
  }

  const { data } = await supabase
    .from("ai_user_limits")
    .select("ai_token_credits")
    .eq("user_id", userId)
    .maybeSingle();

  return NextResponse.json({ ok: true, data: { userId, ai_token_credits: data?.ai_token_credits ?? 0 } });
}
