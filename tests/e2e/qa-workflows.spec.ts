import { expect, test, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

loadEnvConfig(process.cwd());

type QaAccount = {
  id: string;
  name: string;
};

type QaTraderFixture = {
  userId: string;
  email: string;
  password: string;
  fullName: string;
  accounts: QaAccount[];
  partnerId: string;
};

type PaymentOrderRow = {
  id: string;
  status: string;
  paid_at: string | null;
  trading_account_id: string | null;
  tier: string | null;
  bot_product_id: string | null;
  billing_products: {
    code: string;
    name: string;
  } | null;
};

type SubscriptionRow = {
  id: string;
  status: string;
  payment_order_id: string | null;
  current_period_end: string | null;
};

type CopyEntitlementRow = {
  id: string;
  status: string;
  payment_order_id: string | null;
  trading_account_id: string | null;
  tier: string;
};

type BotAccessRow = {
  id: string;
  status: string;
  product_id: string;
  granted_at: string | null;
  bot_products: {
    name: string;
  } | null;
};

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const adminState = path.join(process.cwd(), "tests", "e2e", ".auth", "admin.json");
const partnerState = path.join(process.cwd(), "tests", "e2e", ".auth", "partner.json");

async function loginAs(page: Page, email: string, password: string, expectedPath: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(`**${expectedPath}`);
}

async function createQaTraderFixture(): Promise<QaTraderFixture> {
  const stamp = Date.now();
  const email = `qa-trader-${stamp}@aurix.local`;
  const password = "Password123!";
  const fullName = `QA Trader ${stamp}`;

  const { data: partnerProfile, error: partnerError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", "partner@aurix.local")
    .single();

  if (partnerError || !partnerProfile) {
    throw new Error(`Failed to find seed partner: ${partnerError?.message ?? "missing"}`);
  }

  const { data: createdUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createError || !createdUser.user) {
    throw new Error(`Failed to create QA trader: ${createError?.message ?? "missing user"}`);
  }

  const userId = createdUser.user.id;
  const nowIso = new Date().toISOString();

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role: "TRADER",
      status: "ACTIVE",
    },
    { onConflict: "id" },
  );
  if (profileError) throw new Error(`Failed to provision profile: ${profileError.message}`);

  const { error: traderProfileError } = await supabase.from("trader_profiles").upsert(
    {
      user_id: userId,
      partner_id: partnerProfile.id,
      partner_assigned_at: nowIso,
    },
    { onConflict: "user_id" },
  );
  if (traderProfileError) throw new Error(`Failed to provision trader profile: ${traderProfileError.message}`);

  const accountPayloads = [
    {
      user_id: userId,
      account_name: `QA Growth ${stamp}`,
      broker_name: "MetaTrader 5 Demo",
      broker_account_id: `QA-GROWTH-${stamp}`,
      status: "CONNECTED",
      currency: "USD",
      initial_balance: 12500,
    },
    {
      user_id: userId,
      account_name: `QA Sprint ${stamp}`,
      broker_name: "MetaTrader 5 Demo",
      broker_account_id: `QA-SPRINT-${stamp}`,
      status: "CONNECTED",
      currency: "USD",
      initial_balance: 8000,
    },
  ];

  const { data: accounts, error: accountError } = await supabase
    .from("trading_accounts")
    .insert(accountPayloads)
    .select("id, account_name");

  if (accountError || !accounts || accounts.length !== 2) {
    throw new Error(`Failed to provision trading accounts: ${accountError?.message ?? "missing accounts"}`);
  }

  const snapshots = accounts.flatMap((account, index) => {
    const baseBalance = index === 0 ? 12500 : 8000;
    return [
      {
        trading_account_id: account.id,
        balance: baseBalance,
        equity: baseBalance + 240,
        floating_pnl: 240,
        drawdown_percent: 1.2,
        captured_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
      {
        trading_account_id: account.id,
        balance: baseBalance,
        equity: baseBalance + 180,
        floating_pnl: 180,
        drawdown_percent: 1.8,
        captured_at: new Date().toISOString(),
      },
    ];
  });

  const { error: snapshotError } = await supabase.from("account_snapshots").insert(snapshots);
  if (snapshotError) throw new Error(`Failed to provision snapshots: ${snapshotError.message}`);

  const trades = accounts.flatMap((account, index) => {
    const baseOpenedAt = new Date(Date.now() - (index + 2) * 60 * 60 * 1000).toISOString();
    return [
      {
        trading_account_id: account.id,
        symbol: index === 0 ? "EURUSD" : "XAUUSD",
        side: "BUY",
        status: "OPEN",
        volume: 0.5,
        open_price: index === 0 ? 1.1023 : 2325.5,
        close_price: null,
        profit: index === 0 ? 180 : 240,
        currency: "USD",
        opened_at: baseOpenedAt,
        closed_at: null,
      },
      {
        trading_account_id: account.id,
        symbol: index === 0 ? "USDJPY" : "NAS100",
        side: "SELL",
        status: "CLOSED",
        volume: 0.3,
        open_price: index === 0 ? 156.22 : 19325.2,
        close_price: index === 0 ? 155.8 : 19240.1,
        profit: index === 0 ? 95 : 210,
        currency: "USD",
        opened_at: new Date(Date.now() - (index + 6) * 60 * 60 * 1000).toISOString(),
        closed_at: new Date(Date.now() - (index + 4) * 60 * 60 * 1000).toISOString(),
      },
    ];
  });

  const { error: tradeError } = await supabase.from("trades").insert(trades);
  if (tradeError) throw new Error(`Failed to provision trades: ${tradeError.message}`);

  return {
    userId,
    email,
    password,
    fullName,
    partnerId: partnerProfile.id,
    accounts: accounts.map((account) => ({
      id: account.id,
      name: account.account_name,
    })),
  };
}

async function waitForLatestOrder(userId: string, productCode: string): Promise<PaymentOrderRow> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("payment_orders")
      .select("id, status, paid_at, trading_account_id, tier, bot_product_id, billing_products(code, name)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(`Failed to read payment orders: ${error.message}`);

    const match = (data as unknown as PaymentOrderRow[]).find((row) => row.billing_products?.code === productCode);
    if (match) return match;

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${productCode} order`);
}

async function waitForSubscription(orderId: string, expectedStatus: string): Promise<SubscriptionRow> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("id, status, payment_order_id, current_period_end")
      .eq("payment_order_id", orderId)
      .maybeSingle();

    if (error) throw new Error(`Failed to read subscription row: ${error.message}`);
    if (data && data.status === expectedStatus) return data as SubscriptionRow;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for subscription ${orderId} -> ${expectedStatus}`);
}

async function waitForCopyEntitlement(orderId: string, expectedStatus: string): Promise<CopyEntitlementRow> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("copy_account_entitlements")
      .select("id, status, payment_order_id, trading_account_id, tier")
      .eq("payment_order_id", orderId)
      .maybeSingle();

    if (error) throw new Error(`Failed to read copy entitlement: ${error.message}`);
    if (data && data.status === expectedStatus) return data as CopyEntitlementRow;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for copy entitlement ${orderId} -> ${expectedStatus}`);
}

async function waitForBotAccess(userId: string, botProductId: string, expectedStatus: string): Promise<BotAccessRow> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("bot_access_records")
      .select("id, status, product_id, granted_at, bot_products(name)")
      .eq("user_id", userId)
      .eq("product_id", botProductId)
      .maybeSingle();

    if (error) throw new Error(`Failed to read bot access row: ${error.message}`);
    if (data && data.status === expectedStatus) return data as unknown as BotAccessRow;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for bot access ${botProductId} -> ${expectedStatus}`);
}

async function waitForMentorshipApproval(orderId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("payment_orders")
      .select("metadata")
      .eq("id", orderId)
      .single();

    if (error) throw new Error(`Failed to read mentorship order: ${error.message}`);
    const metadata = data.metadata as { approvedAt?: string } | null;
    if (metadata?.approvedAt) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for mentorship approval ${orderId}`);
}

async function waitForPartnerCommission(orderId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from("partner_commissions")
      .select("id, status")
      .eq("purchase_id", orderId)
      .limit(1);

    if (error) throw new Error(`Failed to read partner commission: ${error.message}`);
    if ((data ?? []).length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for partner commission ${orderId}`);
}

async function approvePendingOrder(browser: Browser, orderId: string) {
  const context = await browser.newContext({ storageState: adminState });
  const page = await context.newPage();

  try {
    await page.goto("/admin/billing");
    await expect(page.locator("body")).toContainText(/Billing & Payments/i);

    const result = await page.evaluate(async (id) => {
      const res = await fetch(`/api/admin/billing/purchases/${id}/approve-access`, { method: "POST" });
      return {
        status: res.status,
        json: await res.json(),
      };
    }, orderId);

    expect(result.status).toBe(200);
    expect(result.json.ok).toBe(true);
  } finally {
    await context.close();
  }
}

async function expectDuplicateCheckoutBlocked(
  page: Page,
  payload: { productCode: string; tradingAccountId?: string; tier?: string; botProductId?: string },
) {
  const response = await page.evaluate(async (body) => {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      status: res.status,
      json: await res.json(),
    };
  }, payload);

  expect(response.status).toBe(409);
  expect(response.json.ok).toBe(false);
}

async function getPendingCommissionCount(orderIds: string[]) {
  const { data, error } = await supabase
    .from("partner_commissions")
    .select("purchase_id, status")
    .in("purchase_id", orderIds);

  if (error) throw new Error(`Failed to read commissions: ${error.message}`);
  return (data ?? []).filter((row) => row.status === "PENDING").length;
}

test.describe("QA workflow coverage", () => {
  test.setTimeout(240_000);

  test("demo workspace stays public, workspace-shaped, and non-mutating", async ({ page }) => {
    const externalCalls: string[] = [];
    const mutationCalls: string[] = [];

    page.on("request", (request) => {
      const url = request.url();
      const method = request.method();

      if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && url.startsWith("http://127.0.0.1:4321")) {
        mutationCalls.push(`${method} ${url}`);
      }

      if (/stripe|metaapi|dxfeed|googleapis|generativelanguage/i.test(url)) {
        externalCalls.push(url);
      }
    });

    await page.goto("/login");
    await expect(page.getByRole("link", { name: /View Demo/i })).toBeVisible();
    await page.getByRole("link", { name: /View Demo/i }).click();
    await expect(page).toHaveURL(/\/demo(?:\/dashboard)?$/);
    await expect(page.locator("body")).toContainText(/Demo Mode/i);

    for (const route of ["/demo/dashboard", "/demo/accounts", "/demo/copy-trading", "/demo/marketplace", "/demo/ai"]) {
      await page.goto(route);
      await expect(page.locator("body")).toContainText(/Demo Mode/i);
      await expect(page.locator("body")).not.toContainText(/Application error|Something went wrong|Unhandled Runtime Error/i);
    }

    expect(mutationCalls).toEqual([]);
    expect(externalCalls).toEqual([]);
  });

  test("mock billing auto-activation, duplicate prevention, and partner commission workflows hold end-to-end", async ({
    browser,
    page,
  }) => {
    const qa = await createQaTraderFixture();

    await loginAs(page, qa.email, qa.password, "/dashboard");

    await expect(page.locator("body")).toContainText(/Platform subscription required/i);
    await expect(page.locator("body")).toContainText(/\$50\/month/i);
    await page.getByRole("button", { name: /Activate subscription/i }).click();
    await page.getByRole("button", { name: /Pay \$50/i }).click();
    await page.waitForURL(/\/billing\/return\?/);
    await expect(page.locator("body")).toContainText(/Payment confirmed/i);

    const platformOrder = await waitForLatestOrder(qa.userId, "PLATFORM_MONTHLY");
    expect(platformOrder.status).toBe("PAID");
    await waitForSubscription(platformOrder.id, "ACTIVE");
    await waitForPartnerCommission(platformOrder.id);

    await page.goto("/dashboard");
    await expect(page.locator("body")).toContainText(/Trader workspace|Welcome,/i);
    await expect(page.locator("body")).not.toContainText(/Platform subscription required/i);
    await expectDuplicateCheckoutBlocked(page, { productCode: "PLATFORM_MONTHLY" });

    await page.goto("/copy-trading");
    await expect(page.locator("body")).toContainText(/Per-account copy access/i);

    await page.getByRole("button", { name: "Normal" }).first().click();
    await page.getByRole("button", { name: /Pay \$10/i }).click();
    await page.waitForURL(/\/billing\/return\?/);
    await expect(page.locator("body")).toContainText(/Payment confirmed/i);

    const normalOrder = await waitForLatestOrder(qa.userId, "COPY_NORMAL");
    expect(normalOrder.trading_account_id).toBe(qa.accounts[0].id);
    await waitForPartnerCommission(normalOrder.id);
    const normalEntitlement = await waitForCopyEntitlement(normalOrder.id, "ACTIVE");
    expect(normalEntitlement.tier).toBe("NORMAL");

    await page.goto("/copy-trading");
    await expect(page.locator("body")).toContainText(qa.accounts[0].name);
    await expect(page.locator("body")).toContainText(/Ready for copy trading on this account/i);
    await expectDuplicateCheckoutBlocked(page, {
      productCode: "COPY_NORMAL",
      tradingAccountId: qa.accounts[0].id,
      tier: "NORMAL",
    });

    await page.getByRole("button", { name: "Ultra Fast" }).first().click();
    await page.getByRole("button", { name: /Pay \$15/i }).click();
    await page.waitForURL(/\/billing\/return\?/);
    await expect(page.locator("body")).toContainText(/Payment confirmed/i);

    const premiumOrder = await waitForLatestOrder(qa.userId, "COPY_ULTRA_FAST");
    expect(premiumOrder.trading_account_id).toBe(qa.accounts[1].id);
    await waitForPartnerCommission(premiumOrder.id);
    const premiumEntitlement = await waitForCopyEntitlement(premiumOrder.id, "ACTIVE");
    expect(premiumEntitlement.tier).toBe("PREMIUM");

    await page.goto("/copy-trading");
    await expect(page.locator("body")).toContainText(qa.accounts[1].name);
    await expect(page.locator("body")).toContainText(/Ultra Fast/i);
    await expect(page.getByRole("button", { name: /Follow/i }).first()).toBeEnabled();
    await expectDuplicateCheckoutBlocked(page, {
      productCode: "COPY_ULTRA_FAST",
      tradingAccountId: qa.accounts[1].id,
      tier: "PREMIUM",
    });

    await page.goto("/marketplace");
    await page.getByRole("button", { name: /Buy Bot/i }).first().click();
    await page.getByRole("button", { name: /Pay \$500/i }).click();
    await page.waitForURL(/\/billing\/return\?/);
    await expect(page.locator("body")).toContainText(/Payment confirmed/i);

    const botOrder = await waitForLatestOrder(qa.userId, "BOT_EA");
    expect(botOrder.bot_product_id).toBeTruthy();
    await waitForBotAccess(qa.userId, botOrder.bot_product_id!, "REQUESTED");
    await waitForPartnerCommission(botOrder.id);
    await approvePendingOrder(browser, botOrder.id);
    const botAccess = await waitForBotAccess(qa.userId, botOrder.bot_product_id!, "ACTIVE");

    await page.goto("/my-bots");
    await expect(page.locator("body")).toContainText(botAccess.bot_products?.name ?? /Bot/i);
    await expect(page.locator("body")).toContainText(/Generate license/i);
    await expectDuplicateCheckoutBlocked(page, {
      productCode: "BOT_EA",
      botProductId: botOrder.bot_product_id!,
    });

    await page.goto("/academy");
    await page.getByRole("button", { name: /Pay .*2,500/i }).click();
    await page.getByRole("button", { name: /Pay .*2,500/i }).click();
    await page.waitForURL(/\/billing\/return\?/);
    await expect(page.locator("body")).toContainText(/Payment confirmed/i);

    const mentorshipOrder = await waitForLatestOrder(qa.userId, "MENTORSHIP_1_1");
    await waitForPartnerCommission(mentorshipOrder.id);
    await approvePendingOrder(browser, mentorshipOrder.id);
    await waitForMentorshipApproval(mentorshipOrder.id);

    await page.goto("/academy");
    await expect(page.locator("body")).toContainText(/Mentorship access active/i);
    await expectDuplicateCheckoutBlocked(page, {
      productCode: "MENTORSHIP_1_1",
    });

    await page.goto("/billing");
    await expect(page.locator("body")).toContainText(/Billing & Access/i);
    await expect(page.locator("body")).toContainText(/Active/i);
    await expect(page.locator("body")).not.toContainText(/Buy Bot/i);
    await expect(page.locator("body")).not.toContainText(/Activate subscription/i);

    const commissionCount = await getPendingCommissionCount([
      platformOrder.id,
      normalOrder.id,
      premiumOrder.id,
      botOrder.id,
      mentorshipOrder.id,
    ]);
    expect(commissionCount).toBe(5);

    const partnerContext = await browser.newContext({ storageState: partnerState });
    const partnerPage = await partnerContext.newPage();
    try {
      await partnerPage.goto("/partner");
      await expect(partnerPage.locator("body")).toContainText(/Partner/i);
      await partnerPage.goto("/partner/commissions");
      await expect(partnerPage.locator("body")).toContainText(/Commission/i);
      await partnerPage.goto("/partner/payouts");
      await expect(partnerPage.locator("body")).toContainText(/Payout/i);
      await partnerPage.goto("/partner/traders");
      await expect(partnerPage.locator("body")).toContainText(/Trader/i);
      await partnerPage.goto("/admin");
      await expect(partnerPage).toHaveURL(/\/partner$/);
    } finally {
      await partnerContext.close();
    }

    await page.goto("/admin");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});
