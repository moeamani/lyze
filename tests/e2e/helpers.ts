import { expect, type Page, type TestInfo } from "@playwright/test";

/** A fresh, valid username (3–32 characters) per test run. */
export function uniqueUser(testInfo: TestInfo, label = "user") {
  return `${label.slice(0, 10)}-${testInfo.project.name.slice(0, 1)}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}
/** Kept for older call sites: the same as uniqueUser. */
export const uniqueEmail = uniqueUser;

export const TEST_PASSWORD = "test-password-123";

/**
 * Create a username/password account and land signed in. Dev Mode is turned on by default so tests
 * generate with the offline Placeholder instead of a real AI service.
 */
export async function signIn(page: Page, username: string, callbackUrl?: string, { devMode = true }: { devMode?: boolean } = {}) {
  await page.goto(callbackUrl ? `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/sign-in");
  await page.getByRole("tab", { name: "Create account" }).click();
  const form = page.getByRole("tabpanel", { name: "Create account" });
  await form.getByLabel("Username").fill(username);
  await form.getByLabel("Password").fill(TEST_PASSWORD);
  await form.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
  if (devMode) {
    const back = page.url();
    await page.goto("/account");
    const toggle = page.getByRole("switch", { name: "Dev Mode" });
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeEnabled();
    await page.goto(back);
  }
}

/** Layouts must never scroll sideways, at any width. */
export async function expectNoHorizontalScroll(page: Page) {
  // Mobile browsers widen the layout viewport to fit wide content, so compare to the configured width.
  const width = page.viewportSize()?.width ?? Infinity;
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll).toBeLessThanOrEqual(width);
}
