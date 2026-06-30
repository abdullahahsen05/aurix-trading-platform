import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { generateReferralCode } from "../src/lib/partner/referral";

// ─────────────────────────────────────────────────────────────────────────────
// Seed a demo PARTNER (partner@aurix.local), assign the existing demo trader
// (trader@aurix.local) to them, and add a couple of commission records so the
// partner workspace has real data to show. Idempotent.
// ─────────────────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = readFileSync(join(process.cwd(), ".env.local"), "utf-8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > -1) out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PARTNER = { email: "partner@aurix.local", password: "Password123!", fullName: "Demo Partner" };
const TRADER_EMAIL = "trader@aurix.local";

async function deleteUserByEmail(email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    const users = data?.users ?? [];
    if (users.length === 0) break;
    const match = users.find((u) => u.email === email);
    if (match) {
      await supabase.auth.admin.deleteUser(match.id);
      return;
    }
    if (users.length < 200) break;
  }
}

async function run() {
  console.log("Seeding demo partner...");

  // 1. Fresh partner auth user.
  await deleteUserByEmail(PARTNER.email);
  const { data: created, error: cErr } = await supabase.auth.admin.createUser({
    email: PARTNER.email,
    password: PARTNER.password,
    email_confirm: true,
    user_metadata: { full_name: PARTNER.fullName },
  });
  if (cErr) throw cErr;
  const partnerId = created!.user!.id;
  console.log(`  partner id: ${partnerId}`);

  // 2. Promote to PARTNER, provision partner_profiles, drop their trader_profile.
  await supabase.from("profiles").update({ role: "PARTNER" }).eq("id", partnerId);
  await supabase.from("trader_profiles").delete().eq("user_id", partnerId);
  const referralCode = generateReferralCode(PARTNER.fullName);
  await supabase
    .from("partner_profiles")
    .upsert({ user_id: partnerId, referral_code: referralCode, commission_percent: 30 }, { onConflict: "user_id" });
  console.log(`  referral code: ${referralCode}`);

  // 3. Assign the demo trader to this partner.
  const { data: trader } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", TRADER_EMAIL)
    .maybeSingle();
  if (!trader) {
    console.warn(`  [warn] ${TRADER_EMAIL} not found — run seed-trader-demo first. Skipping assignment.`);
  } else {
    await supabase
      .from("trader_profiles")
      .update({ partner_id: partnerId, partner_assigned_at: new Date().toISOString() })
      .eq("user_id", trader.id);
    console.log(`  assigned trader ${TRADER_EMAIL} → partner`);

    // 4. A couple of commission records so the ledger isn't empty.
    await supabase.from("partner_commissions").insert([
      {
        partner_id: partnerId,
        trader_id: trader.id,
        source_type: "SUBSCRIPTION",
        gross_amount: 99,
        commission_percent: 30,
        commission_amount: 29.7,
        currency: "USD",
        status: "PENDING",
      },
      {
        partner_id: partnerId,
        trader_id: trader.id,
        source_type: "SUBSCRIPTION",
        gross_amount: 99,
        commission_percent: 30,
        commission_amount: 29.7,
        currency: "USD",
        status: "APPROVED",
      },
    ]);
    console.log("  inserted 2 commission records (PENDING + APPROVED)");
  }

  console.log("\nDone. Partner login:");
  console.log(`  ${PARTNER.email} / ${PARTNER.password}`);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
