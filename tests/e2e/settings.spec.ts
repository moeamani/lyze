import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

test("AI key, generation mode, API keys, webhooks and account data", async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo, "settings"));
  await page.getByLabel("Workspace name").fill("Settings Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  const ws = page.url().match(/^.*\/w\/[^/?]+/)![0];

  // No key yet: owners can still generate with the placeholder.
  await page.getByRole("link", { name: /Coffee habits/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const base = page.url().match(/^.*\/p\/[^/?]+/)![0];
  await page.goto(`${base}/writeup`);
  const mode = page.getByRole("combobox", { name: "Generation mode" });
  await expect(mode).toContainText("Placeholder");
  await page.getByRole("button", { name: "Write analysis" }).click();
  await expect(page).toHaveURL(/\/writeup\/wrt/);

  // Add a key in Settings → AI; the key itself never comes back.
  await page.goto(`${ws}/settings/ai`);
  await expect(page.getByText("No API key yet")).toBeVisible();
  // Pick a provider with a free tier: Google Gemini.
  await page.getByRole("combobox", { name: "Provider" }).click();
  await page.getByRole("option", { name: /Google Gemini/ }).click();
  await expect(page.getByRole("link", { name: "Get a key" })).toHaveAttribute("href", /aistudio\.google\.com/);
  await expect(page.getByLabel("Model")).toHaveValue("gemini-2.5-flash");
  await page.getByLabel("API key").fill("AIza-not-a-real-key-000000000000abcd");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Using Google Gemini with this workspace's key (…abcd)")).toBeVisible();
  expect(await page.content()).not.toContain("not-a-real-key");
  await expectNoHorizontalScroll(page);
  await page.goto(`${base}/writeup`);
  await mode.click();
  await page.getByRole("option", { name: "Use AI" }).click();
  await expect(mode).toContainText("Use AI");
  await page.goto(`${ws}/settings/ai`);
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("No API key yet")).toBeVisible();

  // API keys and webhooks.
  await page.getByRole("link", { name: "API & webhooks" }).click();
  await page.getByRole("textbox", { name: "Key name, e.g. R script" }).fill("R script");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("textbox", { name: "New API key" })).toHaveValue(/^lyze_/);
  await page.getByRole("textbox", { name: "Webhook URL" }).fill("https://hooks.example.com/lyze");
  await page.getByRole("button", { name: "Add webhook" }).click();
  await expect(page.getByText("https://hooks.example.com/lyze")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Account: data export is a download link.
  await page.goto("/account");
  await expect(page.getByRole("link", { name: "Download my data" })).toHaveAttribute("href", "/api/account/export");
  await expectNoHorizontalScroll(page);
});
