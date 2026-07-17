import { defineConfig, devices } from "@playwright/test";

const PORT = 4321;
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 2,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  timeout: 120_000,
  expect: {
    timeout: 20_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
      dependencies: ["setup"],
      testIgnore: /.*\.setup\.ts/,
    },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: baseURL,
    env: {
      ...process.env,
      BILLING_PROVIDER: "mock",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
