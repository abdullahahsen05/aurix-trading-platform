import { expect, test } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";

const authDir = path.join(process.cwd(), "tests", "e2e", ".auth");

const roles = [
  {
    name: "admin",
    email: "admin@aurix.local",
    password: "Password123!",
    homePath: "/admin",
  },
  {
    name: "trader",
    email: "trader@aurix.local",
    password: "Password123!",
    homePath: "/dashboard",
  },
  {
    name: "partner",
    email: "partner@aurix.local",
    password: "Password123!",
    homePath: "/partner",
  },
] as const;

test("create storage state for demo roles", async ({ browser }) => {
  await fs.mkdir(authDir, { recursive: true });

  for (const role of roles) {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/login");
    await page.getByLabel("Email").fill(role.email);
    await page.getByLabel("Password").fill(role.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL(`**${role.homePath}`);
    await expect(page).toHaveURL(new RegExp(`${role.homePath.replace("/", "\\/")}$`));
    await context.storageState({ path: path.join(authDir, `${role.name}.json`) });
    await context.close();
  }
});
