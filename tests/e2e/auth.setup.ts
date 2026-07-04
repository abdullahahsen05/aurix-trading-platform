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

test("create storage state for demo roles", async ({ page }) => {
  await fs.mkdir(authDir, { recursive: true });

  for (const role of roles) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(role.email);
    await page.getByLabel("Password").fill(role.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(`**${role.homePath}`);
    await expect(page).toHaveURL(new RegExp(`${role.homePath.replace("/", "\\/")}$`));
    await page.context().storageState({ path: path.join(authDir, `${role.name}.json`) });
    await page.context().clearCookies();
  }
});
