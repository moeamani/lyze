import { expect, type Page, type TestInfo } from "@playwright/test";

export function uniqueEmail(testInfo: TestInfo, label = "user") {
  return `${label}-${testInfo.project.name}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@example.com`;
}

/** Sign in through the real magic-link flow, picking the link up from the dev mailbox. */
export async function signIn(page: Page, email: string, callbackUrl?: string) {
  await page.goto(callbackUrl ? `/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page).toHaveURL(/\/sign-in\/check-email$/);
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

  await page.goto("/dev/mailbox");
  const mail = page.getByRole("listitem").filter({ has: page.getByTestId("mail-to").getByText(email, { exact: true }) }).first();
  const href = await mail.getByTestId("mail-link").getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
}

/** Layouts must never scroll sideways, at any width. */
export async function expectNoHorizontalScroll(page: Page) {
  // Mobile browsers widen the layout viewport to fit wide content, so compare to the configured width.
  const width = page.viewportSize()?.width ?? Infinity;
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scroll).toBeLessThanOrEqual(width);
}
