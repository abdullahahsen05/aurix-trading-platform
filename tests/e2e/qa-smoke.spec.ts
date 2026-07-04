import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { loadEnvConfig } from "@next/env";
import path from "node:path";

loadEnvConfig(process.cwd());

type Role = "admin" | "trader" | "partner";
type RouteSpec = {
  path: string;
  expectedHeading?: RegExp;
  allowNotFound?: boolean;
};

type DemoFixtures = {
  traderAccountId: string | null;
  certificateVerificationId: string | null;
  evaluationAttemptId: string | null;
};

const authState = (role: Role) => path.join(process.cwd(), "tests", "e2e", ".auth", `${role}.json`);
const bannedText = [
  /Application error/i,
  /Something went wrong/i,
  /Unhandled Runtime Error/i,
  /^404$/m,
  /^500$/m,
] as const;

const publicRoutes: RouteSpec[] = [
  { path: "/", expectedHeading: /Welcome back|AURIX/i },
  { path: "/login", expectedHeading: /Welcome back/i },
];

let fixturesPromise: Promise<DemoFixtures> | null = null;

function getSupabaseAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function getFixtures(): Promise<DemoFixtures> {
  if (!fixturesPromise) {
    fixturesPromise = (async () => {
      const supabase = getSupabaseAdminClient();
      const { data: trader } = await supabase.from("profiles").select("id").eq("email", "trader@aurix.local").single();
      const [account, cert, attempt] = await Promise.all([
        trader
          ? supabase.from("trading_accounts").select("id").eq("user_id", trader.id).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("evaluation_certificates").select("verification_id").limit(1).maybeSingle(),
        trader
          ? supabase.from("evaluation_attempts").select("id").eq("user_id", trader.id).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      return {
        traderAccountId: account.data?.id ?? null,
        certificateVerificationId: cert.data?.verification_id ?? null,
        evaluationAttemptId: attempt.data?.id ?? null,
      };
    })();
  }

  return fixturesPromise;
}

function trackedPage(page: Page) {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText ?? "unknown";
    if (errorText.includes("net::ERR_ABORTED")) return;
    failedRequests.push(`${request.method()} ${request.url()} :: ${errorText}`);
  });

  page.on("response", async (response) => {
    if (response.status() >= 400) {
      const url = response.url();
      if (!url.includes("/api/auth/session")) {
        failedRequests.push(`${response.request().method()} ${url} :: HTTP ${response.status()}`);
      }
    }
  });

  return { consoleErrors, failedRequests };
}

async function expectHealthyRoute(page: Page, route: RouteSpec) {
  const telemetry = trackedPage(page);

  await page.goto(route.path, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toBeVisible();
  await page.waitForTimeout(500);

  if (route.expectedHeading) {
    await expect(page.locator("body")).toContainText(route.expectedHeading);
  }

  for (const pattern of bannedText) {
    await expect(page.locator("body")).not.toContainText(pattern);
  }

  expect.soft(telemetry.consoleErrors, `${route.path} console errors`).toEqual([]);
  expect.soft(telemetry.failedRequests, `${route.path} failed requests`).toEqual([]);
}

test("public routes load without runtime failures", async ({ page }) => {
  const fixtures = await getFixtures();
  const routes = [...publicRoutes];

  if (fixtures.certificateVerificationId) {
    routes.push({
      path: `/certificates/verify/${fixtures.certificateVerificationId}`,
      expectedHeading: /Certificate/i,
    });
  }

  for (const route of routes) {
    await expectHealthyRoute(page, route);
  }
});

test.describe("admin workspace", () => {
  test.use({ storageState: authState("admin") });

  test("major admin routes load", async ({ page }) => {
    const routes: RouteSpec[] = [
      { path: "/admin", expectedHeading: /Admin/i },
      { path: "/admin/accounts", expectedHeading: /Accounts/i },
      { path: "/admin/copy", expectedHeading: /Copy/i },
      { path: "/admin/jobs", expectedHeading: /Jobs/i },
      { path: "/admin/users", expectedHeading: /Users/i },
      { path: "/admin/marketplace", expectedHeading: /Marketplace/i },
      { path: "/admin/academy", expectedHeading: /Academy/i },
      { path: "/admin/evaluations", expectedHeading: /Evaluations/i },
      { path: "/admin/terminal", expectedHeading: /Terminal/i },
      { path: "/admin/ai", expectedHeading: /AI/i },
    ];

    for (const route of routes) {
      await expectHealthyRoute(page, route);
    }
  });
});

test.describe("trader workspace", () => {
  test.use({ storageState: authState("trader") });

  test("major trader routes load", async ({ page }) => {
    const fixtures = await getFixtures();
    const routes: RouteSpec[] = [
      { path: "/dashboard", expectedHeading: /Dashboard/i },
      { path: "/accounts", expectedHeading: /Accounts/i },
      { path: "/copy-trading", expectedHeading: /Copy/i },
      { path: "/marketplace", expectedHeading: /Marketplace/i },
      { path: "/my-bots", expectedHeading: /Bot|License|Marketplace/i },
      { path: "/academy", expectedHeading: /Academy/i },
      { path: "/evaluations", expectedHeading: /Evaluations/i },
      { path: "/terminal", expectedHeading: /Terminal/i },
      { path: "/ai", expectedHeading: /AI/i },
    ];

    if (fixtures.traderAccountId) {
      routes.push({ path: `/accounts/${fixtures.traderAccountId}`, expectedHeading: /Account|Overview|Equity/i });
    }
    if (fixtures.evaluationAttemptId) {
      routes.push({ path: `/evaluations/${fixtures.evaluationAttemptId}`, expectedHeading: /Evaluation|Attempt/i });
    }

    for (const route of routes) {
      await expectHealthyRoute(page, route);
    }
  });
});

test.describe("partner workspace", () => {
  test.use({ storageState: authState("partner") });

  test("major partner routes load", async ({ page }) => {
    const routes: RouteSpec[] = [
      { path: "/partner", expectedHeading: /Partner|Overview/i },
      { path: "/partner/traders", expectedHeading: /Trader/i },
      { path: "/partner/commissions", expectedHeading: /Commission/i },
      { path: "/partner/crm", expectedHeading: /CRM|Notes/i },
    ];

    for (const route of routes) {
      await expectHealthyRoute(page, route);
    }
  });
});
