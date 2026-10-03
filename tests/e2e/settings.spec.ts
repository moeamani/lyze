import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueUser } from "./helpers";

test("Dev Mode, AI sources, API keys, webhooks and account data", async ({ page }, testInfo) => {
  // This server runs without LYZE_AI_KEY, so nothing can generate until a key or Dev Mode.
  await signIn(page, uniqueUser(testInfo, "settings"), undefined, { devMode: false });
  await page.getByLabel("Workspace name").fill("Settings Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  const ws = page.url().match(/^.*\/w\/[^/?]+/)![0];

  // No Lyze AI, no key, no Dev Mode: Placeholder isn't offered, only a set-up link.
  await page.getByRole("link", { name: /Coffee habits/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const base = page.url().match(/^.*\/p\/[^/?]+/)![0];
  await page.goto(`${base}/writeup`);
  const mode = page.getByRole("combobox", { name: "Generation mode" });
  await expect(page.getByRole("link", { name: "Set up AI" })).toBeVisible();
  await expect(mode).toHaveCount(0);

  // Dev Mode (account settings) turns Placeholder on.
  await page.goto("/account");
  await page.getByRole("switch", { name: "Dev Mode" }).click();
  await expect(page.getByRole("switch", { name: "Dev Mode" })).toBeChecked();
  await page.goto(`${base}/writeup`);
  await expect(page.getByRole("link", { name: "Set up AI" })).toHaveCount(0);
  await page.getByRole("button", { name: "Write analysis" }).click();
  await expect(page).toHaveURL(/\/writeup\/wrt/);

  // Add the workspace's own key in Settings → AI; the key itself never comes back.
  await page.goto(`${ws}/settings/ai`);
  await expect(page.getByText("Lyze AI isn't set up on this server")).toBeVisible();
  await expect(page.getByText("No key added")).toBeVisible();
  // Pick a provider with a free tier: Google Gemini.
  await page.getByRole("combobox", { name: "Provider" }).click();
  await page.getByRole("option", { name: /Google Gemini/ }).click();
  await expect(page.getByRole("link", { name: "Get a key" })).toHaveAttribute("href", /aistudio\.google\.com/);
  await expect(page.getByLabel("Model")).toHaveValue("gemini-3.8-flash");
  await page.getByLabel("API key").fill("AIza-not-a-real-key-000000000000abcd");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Using Google Gemini with this workspace's key (…abcd)")).toBeVisible();
  expect(await page.content()).not.toContain("not-a-real-key");
  await expectNoHorizontalScroll(page);
  // Now the generate menu offers the workspace key and Placeholder.
  await page.goto(`${base}/writeup`);
  await expect(mode).toContainText("Your key · Google Gemini");
  await mode.click();
  await page.getByRole("option", { name: "Placeholder" }).click();
  await expect(mode).toContainText("Placeholder");
  await page.goto(`${ws}/settings/ai`);
  await page.getByRole("button", { name: "Remove key" }).click();
  await expect(page.getByText("No key added")).toBeVisible();

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
