import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const PORT = Number(process.env.E2E_PORT ?? 3200);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

// Use a preinstalled Chromium when available (e.g. sandboxed CI images); otherwise Playwright's own.
const executablePath = ["/opt/pw-browsers/chromium", process.env.CHROMIUM_PATH]
  .filter((p): p is string => !!p)
  .find((p) => fs.existsSync(p) && fs.statSync(p).isFile());

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 }, browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        // A production build against a throwaway in-memory database.
        command: `npm run build && npx next start -p ${PORT}`,
        url: `${baseURL}/sign-in`,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
        env: { PGLITE_DIR: "memory://", LYZE_DEV_MAILBOX: "1", AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e" },
      },
});
