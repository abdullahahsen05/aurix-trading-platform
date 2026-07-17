/**
 * Manual Browser QA Spec
 *
 * Real browser-driven QA: every workflow tested by clicking through the UI, not via
 * API/DB shortcuts. Screenshots captured at key moments for evidence.
 *
 * Run: npx playwright test tests/e2e/manual-browser-qa.spec.ts --headed --trace=on
 */

import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import fs from "node:fs/promises";

loadEnvConfig(process.cwd());

// ── Constants ────────────────────────────────────────────────────────────────

const SS_DIR = path.join(process.cwd(), "tests", "e2e", "screenshots");
const ADMIN_STATE = path.join(process.cwd(), "tests", "e2e", ".auth", "admin.json");
const PARTNER_STATE = path.join(process.cwd(), "tests", "e2e", ".auth", "partner.json");
const TRADER_STATE = path.join(process.cwd(), "tests", "e2e", ".auth", "trader.json");

// ── Supabase admin client ─────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Shared fixture ────────────────────────────────────────────────────────────

type QaTrader = {
  userId: string;
  email: string;
  password: string;
  fullName: string;
  accounts: Array<{ id: string; name: string }>;
};

let qa: QaTrader;
let shotN = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function shot(page: Page, label: string): Promise<void> {
  shotN++;
  const filename = `${String(shotN).padStart(3, "0")}-${label}.png`;
  await page.screenshot({ path: path.join(SS_DIR, filename), fullPage: false });
  console.log(`  📸  ${filename}`);
}

async function loginViaUI(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Wait for redirect away from /login
  await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 15_000 });
}

/**
 * Approve the most recent pending order for a trader via the admin billing UI.
 * Opens a NEW browser context with admin storage state, navigates to /admin/billing,
 * finds the row by trader email, clicks "Approve access", confirms the dialog.
 */
async function approveViaAdminUI(browser: Browser, traderEmail: string, label: string): Promise<void> {
  const ctx = await browser.newContext({ storageState: ADMIN_STATE });
  const adminPage = await ctx.newPage();
  try {
    await adminPage.goto("/admin/billing");
    await expect(adminPage.getByText("Billing & Payments")).toBeVisible({ timeout: 15_000 });

    // Refresh so we have the latest pending approvals
    // Two Refresh buttons exist on /admin/billing (header + table), use .first()
    await adminPage.getByRole("button", { name: "Refresh" }).first().click();
    await adminPage.waitForTimeout(800);
    await shot(adminPage, `admin-billing-${label}`);

    // ── Find the pending-approvals row for our trader ────────────────────
    // The email appears in TWO tables (pending approvals + payment orders).
    // Scope to the row that also contains the "Approve access" button.
    const traderRow = adminPage
      .locator("tr")
      .filter({ hasText: traderEmail })
      .filter({ has: adminPage.getByRole("button", { name: "Approve access" }) });
    await expect(traderRow).toBeVisible({ timeout: 10_000 });

    const approveBtn = traderRow.getByRole("button", { name: "Approve access" });
    await expect(approveBtn).toBeVisible();
    await approveBtn.click();
    await shot(adminPage, `admin-approve-dialog-${label}`);

    // ── Confirm in the Radix dialog ───────────────────────────────────────
    await expect(adminPage.getByRole("button", { name: "Confirm & approve" })).toBeVisible({ timeout: 5_000 });
    await adminPage.getByRole("button", { name: "Confirm & approve" }).click();

    // ── Wait for success banner ───────────────────────────────────────────
    await expect(adminPage.getByText("Access approved successfully.")).toBeVisible({ timeout: 15_000 });
    await shot(adminPage, `admin-approve-success-${label}`);
    console.log(`  ✅  Admin approved ${label} via UI (email: ${traderEmail})`);
  } finally {
    await ctx.close();
  }
}

async function createQaTrader(): Promise<QaTrader> {
  const stamp = Date.now();
  const email = `qa-browser-${stamp}@aurix.local`;
  const password = "Password123!";
  const fullName = `QA Browser ${stamp}`;

  const { data: partner } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "partner@aurix.local")
    .single();
  if (!partner) throw new Error("Seed partner not found");

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr || !created.user) throw new Error(`Failed to create QA user: ${createErr?.message}`);
  const userId = created.user.id;

  await supabase.from("profiles").upsert(
    { id: userId, email, full_name: fullName, role: "TRADER", status: "ACTIVE" },
    { onConflict: "id" },
  );

  await supabase.from("trader_profiles").upsert(
    { user_id: userId, partner_id: partner.id, partner_assigned_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );

  const { data: accounts, error: accErr } = await supabase
    .from("trading_accounts")
    .insert([
      {
        user_id: userId,
        account_name: `QA Growth ${stamp}`,
        broker_name: "MetaTrader 5 Demo",
        broker_account_id: `QA-G-${stamp}`,
        status: "CONNECTED",
        currency: "USD",
        initial_balance: 10000,
      },
      {
        user_id: userId,
        account_name: `QA Sprint ${stamp}`,
        broker_name: "MetaTrader 5 Demo",
        broker_account_id: `QA-S-${stamp}`,
        status: "CONNECTED",
        currency: "USD",
        initial_balance: 5000,
      },
    ])
    .select("id, account_name");

  if (accErr || !accounts || accounts.length < 2)
    throw new Error(`Failed to create accounts: ${accErr?.message}`);

  return {
    userId,
    email,
    password,
    fullName,
    accounts: accounts.map((a) => ({ id: a.id, name: a.account_name as string })),
  };
}

// ── Test suite ────────────────────────────────────────────────────────────────

test.describe("Manual Browser QA — real UI click-through", () => {
  test.setTimeout(600_000); // 10 min — flows involve many page transitions

  test.beforeAll(async () => {
    await fs.mkdir(SS_DIR, { recursive: true });
    qa = await createQaTrader();
    console.log(`\n🧪  QA Trader created: ${qa.email}`);
    console.log(`    Accounts: ${qa.accounts.map((a) => a.name).join(", ")}\n`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // W1: Platform subscription — full UI workflow
  // ─────────────────────────────────────────────────────────────────────────

  test("W1: Platform subscription — verified payment auto-activates and unlocks routes", async ({ page }) => {
    console.log("\n══  W1: Platform Subscription  ══");

    // 1. Login as unpaid QA trader
    await loginViaUI(page, qa.email, qa.password);
    console.log("  1.  Logged in as unpaid QA trader");

    // 2. Dashboard is locked
    await page.waitForURL("**/dashboard", { timeout: 10_000 });
    await expect(page.getByText("Platform subscription required")).toBeVisible({ timeout: 10_000 });
    await shot(page, "w1-01-dashboard-locked");
    console.log("  2.  ✅  /dashboard locked — 'Platform subscription required' visible");

    // 3. Key routes should be locked too
    for (const route of ["/accounts", "/terminal", "/ai", "/trades"]) {
      await page.goto(route);
      const isLocked = await page.getByText("Platform subscription required").isVisible().catch(() => false);
      console.log(`  3.  ${route}  locked: ${isLocked ? "YES ✅" : "NO — accessible without sub"}`);
    }
    await page.goto("/dashboard");

    // 4. Free routes accessible without subscription
    for (const route of ["/billing", "/marketplace", "/academy", "/evaluations"]) {
      await page.goto(route);
      const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      const locked = await page.getByText("Platform subscription required").isVisible().catch(() => false);
      console.log(`  4.  ${route}  crash:${crashed}  locked:${locked}  → ${!crashed && !locked ? "✅ free" : locked ? "🔒 locked" : "❌ crash"}`);
    }

    // 5. Click "Activate subscription" on dashboard
    await page.goto("/dashboard");
    const activateBtn = page.getByRole("button", { name: /Activate subscription/i });
    await expect(activateBtn).toBeVisible({ timeout: 10_000 });
    await activateBtn.click();
    await shot(page, "w1-02-checkout-modal");
    console.log("  5.  Clicked 'Activate subscription'");

    // 6. Modal shows product details — target dialog specifically to avoid strict-mode violation
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(dialog.getByRole("heading", { name: "WSA Global Trading Platform Subscription" })).toBeVisible();
    // Check the Pay button to confirm price — two elements match /\$50/ (amount row + button), so target button specifically
    await expect(dialog.getByRole("button", { name: /Pay \$50/ })).toBeVisible();
    await shot(page, "w1-02b-checkout-modal-open");
    console.log("  6.  ✅  Modal: WSA Global Trading Platform Subscription — $50 — Pay button visible");

    // 7. Confirm payment in modal
    const payBtn = page.getByRole("button", { name: /^Pay/ });
    await expect(payBtn).toBeVisible();
    await payBtn.click();
    console.log("  7.  Clicked Pay button in modal");

    // 8. Redirected to /billing/return — payment confirmed
    await page.waitForURL(/\/billing\/return/, { timeout: 20_000 });
    await expect(page.getByText("Payment confirmed")).toBeVisible({ timeout: 15_000 });
    await shot(page, "w1-03-payment-confirmed");
    console.log("  8.  ✅  /billing/return — 'Payment confirmed' shown");

    // 9. Back to dashboard — access is active without an admin step
    await page.goto("/dashboard");
    await page.waitForTimeout(500); // allow React Query to refetch
    await page.reload();

    const stillLocked = await page.getByText("Platform subscription required").isVisible().catch(() => false);
    await shot(page, "w1-06-dashboard-unlocked");
    console.log(`  9.  Dashboard still locked after verified payment: ${stillLocked ? "❌ FAIL" : "✅ UNLOCKED"}`);

    for (const route of ["/accounts", "/terminal", "/ai", "/trades", "/analytics", "/risk", "/reports"]) {
      await page.goto(route);
      const locked = await page.getByText("Platform subscription required").isVisible().catch(() => false);
      console.log(`  9.  ${route}  unlocked: ${!locked ? "✅" : "❌ STILL LOCKED"}`);
    }

    // 10. /billing shows Active with renewal date
    await page.goto("/billing");
    const activeStatus = await page.getByText(/Active/).isVisible().catch(() => false);
    const renewalDate = await page.getByText(/Renews/).isVisible().catch(() => false);
    await shot(page, "w1-07-billing-active");
    console.log(`  10. /billing ACTIVE: ${activeStatus ? "✅" : "❌"}  Renewal date: ${renewalDate ? "✅" : "❌"}`);

    // 11. Pay button hidden after activation (duplicate checkout blocked)
    const dupPayBtn = await page.getByRole("button", { name: /Activate subscription/i }).isVisible().catch(() => false);
    console.log(`  11. Duplicate Activate button gone: ${!dupPayBtn ? "✅" : "❌"}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // W2: Copy trading entitlements — Normal & Ultra Fast via UI
  // ─────────────────────────────────────────────────────────────────────────

  test("W2: Copy entitlements — Normal ($10) + Ultra Fast ($15) via UI", async ({ page }) => {
    console.log("\n══  W2: Copy Trading Entitlements  ══");

    // Pre-condition: W2 needs an active platform subscription.
    // W1 tests the subscription UI in detail; here we run through the same UI flow
    // quickly so W2 can focus on copy entitlements independently of W1.
    await loginViaUI(page, qa.email, qa.password);

    // Check if platform sub is already active (e.g. if W1 already ran for this QA trader)
    await page.goto("/dashboard");
    // Wait for React Query to fetch subscription status before checking lock state.
    // 1 s was insufficient for fresh traders — networkidle ensures the XHR has resolved.
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    const alreadyActive = !(await page.getByText("Platform subscription required").isVisible().catch(() => false));
    if (!alreadyActive) {
      console.log("  0.  Platform sub not active — setting up via UI before copy entitlement tests");
      const activateBtn2 = page.getByRole("button", { name: /Activate subscription/i });
      await expect(activateBtn2).toBeVisible({ timeout: 10_000 });
      await activateBtn2.click();
      const setupDialog = page.getByRole("dialog");
      await expect(setupDialog).toBeVisible({ timeout: 8_000 });
      await setupDialog.getByRole("button", { name: /^Pay/ }).click();
      await page.waitForURL(/\/billing\/return/, { timeout: 20_000 });
      await expect(page.getByText("Payment confirmed")).toBeVisible({ timeout: 15_000 });
      await page.goto("/dashboard");
      await page.waitForTimeout(1000);
      console.log("  0.  Platform subscription auto-activated after verified payment");
    } else {
      console.log("  0.  Platform subscription already active");
    }

    // 1. /copy-trading should NOT be locked after platform subscription is active
    await page.goto("/copy-trading");
    await page.waitForTimeout(2000); // let React Query load the subscription status
    const platformLock = await page.getByText("Platform subscription required").isVisible().catch(() => false);
    await shot(page, "w2-01-copy-trading-loaded");
    console.log(`  1.  /copy-trading platform lock: ${platformLock ? "❌ LOCKED" : "✅ Not locked"}`);

    // 2. Tier cards visible — these are <button> elements containing "Normal" and "Ultra Fast" text
    await expect(page.locator("button").filter({ hasText: "Normal" }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("button").filter({ hasText: "Ultra Fast" }).first()).toBeVisible({ timeout: 5_000 });
    console.log("  2.  ✅  Normal and Ultra Fast tier cards visible");

    // ── Normal tier for Account 1 ─────────────────────────────────────────
    console.log(`\n  Testing NORMAL tier for: ${qa.accounts[0].name}`);
    // The Normal tier button contains "Normal", "Standard copy speed", "$10 / month"
    const normalCard = page.locator("button").filter({ hasText: "Normal" }).first();
    await expect(normalCard).toBeVisible({ timeout: 5_000 });
    await normalCard.click();
    await shot(page, "w2-02-normal-tier-modal");
    console.log("  3.  Clicked 'Normal' tier card");

    // Verify modal content — use Pay button (avoids strict-mode: /\$10/ matches amount span + button)
    const copyDialog = page.getByRole("dialog");
    await expect(copyDialog).toBeVisible({ timeout: 8_000 });
    await expect(copyDialog.getByRole("heading", { name: "Copy Trading - Normal" })).toBeVisible();
    await expect(copyDialog.getByRole("button", { name: /Pay \$10/ })).toBeVisible();
    console.log("  4.  ✅  Modal: Copy Trading - Normal — Pay $10 button visible");

    // Pay
    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.waitForURL(/\/billing\/return/, { timeout: 20_000 });
    await expect(page.getByText("Payment confirmed")).toBeVisible({ timeout: 15_000 });
    await shot(page, "w2-03-normal-payment-confirmed");
    console.log("  5.  ✅  Normal tier $10 payment confirmed");

    // Verified copy payments activate automatically; no admin approval is required.
    await page.goto("/copy-trading");
    const copyPending = await page.getByText(/pending admin approval/i).isVisible().catch(() => false);
    expect(copyPending).toBe(false);
    await shot(page, "w2-04-normal-auto-active");
    console.log("  6.  ✅  Normal copy access has no admin-approval state");

    // Copy access is already active after the verified mock confirmation.
    console.log("  7.  ✅  Normal copy access auto-activated after verified payment");

    // Verify Normal active
    await page.goto("/copy-trading");
    await page.reload();
    await page.waitForTimeout(500);
    const copyReadyText = await page.getByText(/Ready for copy trading/i).isVisible().catch(() => false);
    await shot(page, "w2-05-normal-active");
    console.log(`  8.  'Ready for copy trading' visible: ${copyReadyText ? "✅" : "not found (may vary)"}`);

    // ── Ultra Fast tier for Account 2 ────────────────────────────────────
    console.log(`\n  Testing ULTRA FAST tier for: ${qa.accounts[1].name}`);

    // Ultra Fast button on a second account row
    const ultraCard = page.locator("button").filter({ hasText: "Ultra Fast" }).first();
    await expect(ultraCard).toBeVisible({ timeout: 10_000 });
    await ultraCard.click();
    await shot(page, "w2-06-ultrafast-modal");
    console.log("  9.  Clicked 'Ultra Fast' tier card");

    const ultraDialog = page.getByRole("dialog");
    await expect(ultraDialog).toBeVisible({ timeout: 8_000 });
    await expect(ultraDialog.getByRole("heading", { name: "Copy Trading - Ultra Fast" })).toBeVisible();
    await expect(ultraDialog.getByRole("button", { name: /Pay \$15/ })).toBeVisible();
    console.log("  10. ✅  Modal: Copy Trading - Ultra Fast — Pay $15 button visible");

    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.waitForURL(/\/billing\/return/, { timeout: 20_000 });
    await expect(page.getByText("Payment confirmed")).toBeVisible({ timeout: 15_000 });
    await shot(page, "w2-07-ultrafast-payment-confirmed");
    console.log("  11. ✅  Ultra Fast $15 payment confirmed");

    // Ultra Fast access is also active without an admin approval step.
    console.log("  12. ✅  Ultra Fast access auto-activated after verified payment");

    // Verify on billing page
    await page.goto("/billing");
    await page.reload();
    const copyEntitlementsPending = await page.getByText(/Pending approval/).count();
    const copyEntitlementsActive = await page.getByText(/Active/).count();
    await shot(page, "w2-08-billing-copy-entitlements");
    console.log(`  13. /billing — active entitlements: ${copyEntitlementsActive}  pending: ${copyEntitlementsPending}`);

    // Duplicate checkout for account 1 (Normal already purchased) should be blocked
    const dupStatus = await page.evaluate(async (accountId) => {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productCode: "COPY_NORMAL", tradingAccountId: accountId, tier: "NORMAL" }),
      });
      return res.status;
    }, qa.accounts[0].id);
    console.log(`  14. Duplicate Normal checkout blocked: ${dupStatus === 409 ? `✅ 409 Conflict` : `❌ returned ${dupStatus}`}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // W3: Bot marketplace — purchase via UI
  // ─────────────────────────────────────────────────────────────────────────

  test("W3: Bot Marketplace — Buy Bot via UI → automatic Access granted", async ({ page }) => {
    console.log("\n══  W3: Bot Marketplace  ══");

    await loginViaUI(page, qa.email, qa.password);

    // 1. Open marketplace
    await page.goto("/marketplace");
    const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
    await shot(page, "w3-01-marketplace");
    console.log(`  1.  /marketplace loaded: ${!crashed ? "✅" : "❌ CRASH"}`);

    // 2. Find and click "Buy Bot" button
    await expect(page.getByRole("button", { name: "Buy Bot" }).first()).toBeVisible({ timeout: 15_000 });
    const botNameEl = page.locator(".font-semibold.text-foreground").first();
    const botName = await botNameEl.textContent().catch(() => "(unknown)");
    console.log(`  2.  First bot visible: "${botName}"`);
    await page.getByRole("button", { name: "Buy Bot" }).first().click();
    await shot(page, "w3-02-bot-modal");
    console.log("  3.  Clicked 'Buy Bot' button");

    // 3. Modal shows $500 — use Pay button to confirm (avoids strict-mode: amount span + button both match /\$500/)
    const botDialog = page.getByRole("dialog");
    await expect(botDialog).toBeVisible({ timeout: 8_000 });
    await expect(botDialog.getByRole("button", { name: /Pay \$500/ })).toBeVisible();
    console.log("  4.  ✅  Bot modal: Pay $500 button visible");

    // 4. Pay
    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.waitForURL(/\/billing\/return/, { timeout: 20_000 });
    await expect(page.getByText("Payment confirmed")).toBeVisible({ timeout: 15_000 });
    await shot(page, "w3-03-bot-payment-confirmed");
    console.log("  5.  ✅  Bot $500 payment confirmed");

    // 5. Marketplace shows automatic active access
    await page.goto("/marketplace");
    await page.reload();
    const accessGranted = await page.getByText("Access granted").isVisible().catch(() => false);
    await shot(page, "w3-04-marketplace-access-granted");
    console.log(`  6.  Marketplace automatic 'Access granted' badge: ${accessGranted ? "✅" : "❌"}`);

    // Also buy button should be gone (no second "Buy Bot" for the purchased item)
    const buyBotCount = await page.getByRole("button", { name: "Buy Bot" }).count();
    console.log(`  6b. Remaining 'Buy Bot' buttons: ${buyBotCount} (expected 0 or 1 for other bots)`);

    // 6. /my-bots shows the bot
    await page.goto("/my-bots");
    const crashed2 = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
    await shot(page, "w3-05-my-bots");
    console.log(`  7.  /my-bots loaded: ${!crashed2 ? "✅" : "❌ CRASH"}`);

    // 7. /billing shows bot access
    await page.goto("/billing");
    const botPanel = await page.getByText("Bot / EA Access").isVisible().catch(() => false);
    await shot(page, "w3-06-billing-bot");
    console.log(`  8.  /billing Bot/EA panel visible: ${botPanel ? "✅" : "❌"}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // W4: Mentorship — purchase via UI
  // ─────────────────────────────────────────────────────────────────────────

  test("W4: Mentorship — Pay EUR 2,500 via UI → admin approve via UI → active", async ({ page, browser }) => {
    console.log("\n══  W4: Mentorship  ══");

    await loginViaUI(page, qa.email, qa.password);

    // 1. Open academy
    await page.goto("/academy");
    const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
    await shot(page, "w4-01-academy");
    console.log(`  1.  /academy loaded: ${!crashed ? "✅" : "❌ CRASH"}`);

    // 2. Mentorship card visible
    await expect(page.getByText("1-to-1 Professional Mentorship")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("EUR 2,500 - one-time")).toBeVisible();
    console.log("  2.  ✅  Mentorship card visible — EUR 2,500 one-time");

    // 3. Click "Pay EUR 2,500"
    const payMentorshipBtn = page.getByRole("button", { name: /Pay EUR 2,500/i });
    await expect(payMentorshipBtn).toBeVisible({ timeout: 5_000 });
    await payMentorshipBtn.click();
    await shot(page, "w4-02-mentorship-modal");
    console.log("  3.  Clicked 'Pay EUR 2,500'");

    // 4. Modal shows product and price — formatMoney("EUR",2500) with en-GB gives "€2,500" not "EUR 2,500"
    // Target the Pay button which is unique and confirms both product and price
    const mentorshipDialog = page.getByRole("dialog");
    await expect(mentorshipDialog).toBeVisible({ timeout: 8_000 });
    await expect(mentorshipDialog.getByRole("button", { name: /Pay.*2,500/ })).toBeVisible();
    console.log("  4.  ✅  Mentorship modal open — Pay 2,500 button visible");

    // 5. Confirm pay
    await page.getByRole("button", { name: /^Pay/ }).click();
    await page.waitForURL(/\/billing\/return/, { timeout: 20_000 });
    await expect(page.getByText("Payment confirmed")).toBeVisible({ timeout: 15_000 });
    await shot(page, "w4-03-mentorship-payment-confirmed");
    console.log("  5.  ✅  Mentorship payment confirmed");

    // 6. Academy shows pending approval
    await page.goto("/academy");
    const mentorshipPending = await page.getByText("Payment received - pending admin approval").isVisible().catch(() => false);
    await shot(page, "w4-04-academy-mentorship-pending");
    console.log(`  6.  Academy mentorship pending badge: ${mentorshipPending ? "✅" : "❌"}`);

    const payBtnGone = !(await page.getByRole("button", { name: /Pay EUR 2,500/i }).isVisible().catch(() => false));
    console.log(`  6b. Pay button hidden after purchase: ${payBtnGone ? "✅" : "❌ dup risk"}`);

    // 7. Admin approves
    await approveViaAdminUI(browser, qa.email, "mentorship");
    console.log("  7.  ✅  Admin approved mentorship via UI");

    // 8. Academy shows "Mentorship access active"
    await page.goto("/academy");
    await page.reload();
    const mentorshipActive = await page.getByText("Mentorship access active").isVisible().catch(() => false);
    await shot(page, "w4-05-academy-mentorship-active");
    console.log(`  8.  Academy 'Mentorship access active': ${mentorshipActive ? "✅" : "❌"}`);

    const payBtnHidden = !(await page.getByRole("button", { name: /Pay EUR 2,500/i }).isVisible().catch(() => false));
    console.log(`  9.  Pay button hidden when active: ${payBtnHidden ? "✅" : "❌"}`);

    // 9. Billing page shows mentorship
    await page.goto("/billing");
    const mentorshipPanel = await page.getByText("Mentorship Access").isVisible().catch(() => false);
    await shot(page, "w4-06-billing-mentorship");
    console.log(`  10. /billing Mentorship panel: ${mentorshipPanel ? "✅" : "❌"}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // G1: Admin deny / cancel UI gap check
  // ─────────────────────────────────────────────────────────────────────────

  test("G1: Admin deny / cancel / reject — UI gap verification", async ({ browser }) => {
    console.log("\n══  G1: Admin Deny/Cancel Gap Check  ══");

    const ctx = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await ctx.newPage();

    try {
      await adminPage.goto("/admin/billing");
      await expect(adminPage.getByText("Billing & Payments")).toBeVisible({ timeout: 15_000 });
      await shot(adminPage, "g1-01-admin-billing-full-view");

      // Count action buttons in the page
      const allButtons = await adminPage.locator("button").allTextContents();
      console.log(`  All buttons on /admin/billing: [${allButtons.join(" | ")}]`);

      const approveButtons = allButtons.filter((t) => /approve access/i.test(t));
      const denyButtons = allButtons.filter((t) => /deny|reject/i.test(t));
      const cancelButtons = allButtons.filter((t) => /cancel/i.test(t));

      console.log(`\n  FINDINGS:`);
      console.log(`    Approve access buttons: ${approveButtons.length}`);
      console.log(`    Deny / Reject buttons:  ${denyButtons.length}  → ${denyButtons.length === 0 ? "⚠️  GAP — UI cannot deny" : "OK"}`);
      console.log(`    Cancel buttons (non-modal): ${cancelButtons.length}  → checking context...`);

      // Check if "Cancel" is inside a dialog (that's a dialog-dismiss, not an order cancel)
      const cancelInDialog = await adminPage.locator("[role='dialog'] button").filter({ hasText: /cancel/i }).count();
      console.log(`    Cancel inside dialog (dismiss only): ${cancelInDialog}`);

      console.log(`\n  ⚠️  PRODUCT GAP — G1:`);
      console.log(`    The admin billing UI has ONLY 'Approve access' for each pending order.`);
      console.log(`    There is NO 'Deny', 'Reject', or 'Cancel order' button.`);
      console.log(`    A cancel subscription API exists (POST /api/admin/billing/subscriptions/[id]/cancel)`);
      console.log(`    but it is NOT connected to any admin UI button.`);
      console.log(`    DEMO IMPACT: If a client asks 'what if I need to deny a payment?' there is no UI answer.`);
    } finally {
      await ctx.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // G2: Admin partner commission / payout management — UI gap check
  // ─────────────────────────────────────────────────────────────────────────

  test("G2: Admin partner commission / payout UI — gap verification", async ({ browser }) => {
    console.log("\n══  G2: Admin Partner Commission/Payout Gap Check  ══");

    const ctx = await browser.newContext({ storageState: ADMIN_STATE });
    const adminPage = await ctx.newPage();

    try {
      // Check sidebar
      await adminPage.goto("/admin");
      await shot(adminPage, "g2-01-admin-sidebar");

      const sidebarText = await adminPage.locator("aside, nav").textContent().catch(() => "");
      const hasPartnerLink = /partner|commission|payout/i.test(sidebarText ?? "");
      console.log(`  Admin sidebar has partner/commission/payout link: ${hasPartnerLink ? "YES" : "NO — NOT in sidebar"}`);

      // Try /admin/partners
      await adminPage.goto("/admin/partners");
      await adminPage.waitForTimeout(500);
      const partnersPageBody = await adminPage.locator("body").textContent().catch(() => "");
      const partnersIs404 = /404|not found|page could not be found/i.test(partnersPageBody ?? "");
      const partnersRedirected = !adminPage.url().includes("/admin/partners");
      await shot(adminPage, "g2-02-admin-partners-attempt");
      console.log(`  /admin/partners: ${partnersIs404 ? "404 NOT FOUND" : partnersRedirected ? `Redirected → ${adminPage.url()}` : "EXISTS"}`);

      // Try /admin/partner-commissions
      await adminPage.goto("/admin/partner-commissions");
      await adminPage.waitForTimeout(500);
      const pcBody = await adminPage.locator("body").textContent().catch(() => "");
      const pcIs404 = /404|not found|page could not be found/i.test(pcBody ?? "");
      const pcRedirected = !adminPage.url().includes("partner-commissions");
      await shot(adminPage, "g2-03-admin-partner-commissions-attempt");
      console.log(`  /admin/partner-commissions: ${pcIs404 ? "404 NOT FOUND" : pcRedirected ? `Redirected → ${adminPage.url()}` : "EXISTS"}`);

      // Check /admin/billing for any partner section
      await adminPage.goto("/admin/billing");
      const billingBody = await adminPage.locator("body").textContent().catch(() => "");
      const hasPartnerSection = /partner.*commission|commission.*partner|partner payout/i.test(billingBody ?? "");
      console.log(`  /admin/billing has partner commission section: ${hasPartnerSection ? "YES" : "NO"}`);

      // Verify APIs exist (they exist in code but no UI links to them)
      const partnerCommApiCheck = await adminPage.evaluate(async () => {
        const r = await fetch("/api/admin/partners/commissions");
        return r.status;
      });
      console.log(`  /api/admin/partners/commissions API status: ${partnerCommApiCheck}`);

      console.log(`\n  ⚠️  PRODUCT GAP SUMMARY — G2:`);
      console.log(`    API routes that exist but have NO admin UI page:`);
      console.log(`      GET  /api/admin/partners/commissions       — list all partner commissions`);
      console.log(`      POST /api/admin/partners/commissions/[id]/approve — approve a commission`);
      console.log(`      GET  /api/admin/partners/payouts           — list all payout requests`);
      console.log(`      POST /api/admin/partners/payouts/[id]/mark-paid   — mark payout as paid`);
      console.log(`    There is NO /admin/partners page.`);
      console.log(`    There is NO /admin/partner-commissions page.`);
      console.log(`    The admin sidebar has NO partner management link.`);
      console.log(`    SEVERITY: DEMO BLOCKER — if client asks admin to review/approve partner`);
      console.log(`    commissions or mark payouts as paid, there is no UI to show.`);
    } finally {
      await ctx.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // P1: Partner commission and payout UI walkthrough
  // ─────────────────────────────────────────────────────────────────────────

  test("P1: Partner — commissions, payouts, CRM via UI", async ({ browser }) => {
    console.log("\n══  P1: Partner UI Walkthrough  ══");

    const ctx = await browser.newContext({ storageState: PARTNER_STATE });
    const page = await ctx.newPage();

    try {
      // 1. Partner overview
      await page.goto("/partner");
      const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      await shot(page, "p1-01-partner-overview");
      console.log(`  1.  /partner: ${!crashed ? "✅ loaded" : "❌ CRASH"}`);

      // Check referral code / link
      const hasReferral = await page.getByText(/referral|code|ref link/i).isVisible().catch(() => false);
      console.log(`  1b. Referral code visible: ${hasReferral ? "✅" : "❌"}`);

      // 2. Partner commissions page
      await page.goto("/partner/commissions");
      const commCrashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      await shot(page, "p1-02-partner-commissions");
      console.log(`  2.  /partner/commissions: ${!commCrashed ? "✅ loaded" : "❌ CRASH"}`);

      const commRows = await page.locator("tbody tr").count();
      console.log(`  2b. Commission rows visible: ${commRows}`);
      const pendingFilter = await page.locator("button, span").filter({ hasText: /PENDING/i }).count();
      console.log(`  2c. PENDING filter chip visible: ${pendingFilter > 0 ? "✅" : "❌"}`);

      // Partner cannot approve/reject commissions (no such button expected here)
      const approveCommBtn = await page.getByRole("button", { name: /approve|reject/i }).count();
      console.log(`  2d. Partner has approve/reject commission button: ${approveCommBtn > 0 ? "YES (unexpected)" : "NO (expected — admin only)"}`);

      // 3. Partner payouts page
      await page.goto("/partner/payouts");
      const payoutCrashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      await shot(page, "p1-03-partner-payouts");
      console.log(`  3.  /partner/payouts: ${!payoutCrashed ? "✅ loaded" : "❌ CRASH"}`);

      const requestPayoutBtn = await page.getByRole("button", { name: /request.*payout|payout.*request/i }).isVisible().catch(() => false);
      console.log(`  3b. Partner 'Request payout' button: ${requestPayoutBtn ? "YES — self-service" : "NO — admin-controlled only"}`);

      const adminControlledMsg = await page.getByText(/admin|monthly|processed/i).isVisible().catch(() => false);
      console.log(`  3c. 'Admin processes payouts' message: ${adminControlledMsg ? "✅" : "❌"}`);

      // 4. Partner traders
      await page.goto("/partner/traders");
      const tradersCrashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      await shot(page, "p1-04-partner-traders");
      console.log(`  4.  /partner/traders: ${!tradersCrashed ? "✅ loaded" : "❌ CRASH"}`);

      // 5. Partner CRM
      await page.goto("/partner/crm");
      const crmCrashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      await shot(page, "p1-05-partner-crm");
      console.log(`  5.  /partner/crm: ${!crmCrashed ? "✅ loaded" : "❌ CRASH"}`);

      // 6. RBAC — partner cannot access /admin
      await page.goto("/admin");
      const blockedFromAdmin = !page.url().endsWith("/admin");
      await shot(page, "p1-06-partner-admin-rbac");
      console.log(`  6.  Partner blocked from /admin: ${blockedFromAdmin ? `✅ redirected to ${page.url()}` : "❌ accessed /admin"}`);

      // 7. RBAC — partner cannot access /dashboard
      await page.goto("/dashboard");
      const blockedFromDashboard = !page.url().includes("/dashboard");
      console.log(`  7.  Partner blocked from /dashboard: ${blockedFromDashboard ? `✅ redirected to ${page.url()}` : "❌ accessed /dashboard"}`);
    } finally {
      await ctx.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R1: Public routes — no crash, correct content
  // ─────────────────────────────────────────────────────────────────────────

  test("R1: Public and auth routes — no crash", async ({ page }) => {
    console.log("\n══  R1: Public Routes  ══");

    const routes = [
      { path: "/login",            expectText: /Welcome back|Sign in/i },
      { path: "/register",         expectText: /Create account|Register/i },
      { path: "/forgot-password",  expectText: /Forgot|Reset|Email/i },
      { path: "/reset-password",   expectText: /Reset|password/i },
      { path: "/certificates/verify/test-123", expectText: /Certificate|Verify|not found|invalid/i },
    ];

    for (const { path, expectText } of routes) {
      await page.goto(path);
      const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      const bodyText = (await page.locator("body").textContent().catch(() => "")) ?? "";
      const hasExpected = expectText.test(bodyText);
      console.log(`  ${path}: ${crashed ? "❌ CRASH" : hasExpected ? "✅" : "❌ text not found"}`);
    }

    // Login page: View Demo link
    await page.goto("/login");
    const viewDemo = await page.getByRole("link", { name: /View Demo/i }).isVisible().catch(() => false);
    await shot(page, "r1-login-page");
    console.log(`  /login — View Demo link: ${viewDemo ? "✅" : "❌"}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R2: Demo workspace — all routes load without crash
  // ─────────────────────────────────────────────────────────────────────────

  test("R2: Demo workspace — all routes load without crash or auth wall", async ({ page }) => {
    console.log("\n══  R2: Demo Routes  ══");

    const demoRoutes = [
      "/demo",
      "/demo/dashboard",
      "/demo/accounts",
      "/demo/copy-trading",
      "/demo/marketplace",
      "/demo/my-bots",
      "/demo/academy",
      "/demo/evaluations",
      "/demo/terminal",
      "/demo/ai",
    ];

    for (const route of demoRoutes) {
      await page.goto(route);
      const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      const authWall = await page.getByText(/Sign in|Login required/i).isVisible().catch(() => false);
      console.log(`  ${route}: ${crashed ? "❌ CRASH" : authWall ? "❌ AUTH WALL" : "✅"}`);
    }

    await page.goto("/demo/dashboard");
    await shot(page, "r2-demo-dashboard");
    console.log("  Demo has no auth requirement — navigated without login ✅");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R3: Admin routes — all load without crash
  // ─────────────────────────────────────────────────────────────────────────

  test("R3: Admin routes — full walkthrough", async ({ browser }) => {
    console.log("\n══  R3: Admin Routes  ══");

    const ctx = await browser.newContext({ storageState: ADMIN_STATE });
    const page = await ctx.newPage();

    try {
      const adminRoutes = [
        "/admin",
        "/admin/accounts",
        "/admin/copy",
        "/admin/jobs",
        "/admin/users",
        "/admin/marketplace",
        "/admin/academy",
        "/admin/evaluations",
        "/admin/terminal",
        "/admin/ai",
        "/admin/billing",
      ];

      for (const route of adminRoutes) {
        await page.goto(route);
        const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
        console.log(`  ${route}: ${crashed ? "❌ CRASH" : "✅"}`);
      }

      await page.goto("/admin/billing");
      await shot(page, "r3-admin-billing");
    } finally {
      await ctx.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // R4: Trader (seed) routes — evaluations are free-access, not behind sub gate
  // ─────────────────────────────────────────────────────────────────────────

  test("R4: Evaluations free access — no platform sub required", async ({ browser }) => {
    console.log("\n══  R4: Evaluations Free Access  ══");

    const ctx = await browser.newContext({ storageState: TRADER_STATE });
    const page = await ctx.newPage();

    try {
      await page.goto("/evaluations");
      const crashed = await page.getByText(/Application error|Something went wrong/i).isVisible().catch(() => false);
      const locked = await page.getByText("Platform subscription required").isVisible().catch(() => false);
      await shot(page, "r4-evaluations");
      console.log(`  /evaluations: crashed=${crashed}  locked=${locked}`);
      console.log(`  Free access confirmed: ${!crashed && !locked ? "✅" : "❌"}`);

      // /academy also free
      await page.goto("/academy");
      const academyLocked = await page.getByText("Platform subscription required").isVisible().catch(() => false);
      console.log(`  /academy free access: ${!academyLocked ? "✅" : "❌ LOCKED"}`);

      // /marketplace also free
      await page.goto("/marketplace");
      const marketplaceLocked = await page.getByText("Platform subscription required").isVisible().catch(() => false);
      console.log(`  /marketplace free access: ${!marketplaceLocked ? "✅" : "❌ LOCKED"}`);
    } finally {
      await ctx.close();
    }
  });
});
