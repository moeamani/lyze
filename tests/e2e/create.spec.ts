import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

test("generate, upload or enter data; build, share and print a report", async ({ page, browser }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo, "creator"));
  await page.getByLabel("Workspace name").fill("Create Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.getByRole("link", { name: /Coffee habits/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const base = page.url().match(/^.*\/p\/[^/?]+/)![0];
  await page.goto(base);
  const href = await page.locator('a[href*="/s/"]', { hasText: "Morning coffee survey" }).first().getAttribute("href");
  const study = new URL(href!, base).toString().match(/^.*\/s\/[^/?]+/)![0];

  // Responses: generate test data, then remove it; upload the example file.
  await page.goto(`${study}/responses`);
  await page.getByText("Add data: generate, upload or enter by hand").click();
  await expect(page.getByRole("link", { name: "Open the form for data entry" })).toHaveAttribute("href", /entry=manual/);
  await page.getByRole("spinbutton", { name: "How many" }).fill("12");
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByText("Added 12 test responses")).toBeVisible();
  await expect(page.getByText(/12 responses are generated test data/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Example file" }).click();
  const file = await (await download).path();
  expect(fs.readFileSync(file, "utf8")).toContain("How many cups");
  await page.locator('input[type="file"][accept*="csv"]').setInputFiles(file);
  await expect(page.getByText("Imported 2")).toBeVisible();
  await page.getByRole("button", { name: "Delete test data" }).click();
  await expect(page.getByText("Deleted 12 generated responses")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Reports: generate from the project's data and share it.
  await page.goto(`${base}/reports`);
  await page.getByRole("button", { name: "Generate report" }).click();
  await expect(page).toHaveURL(/\/reports\/rpt/);
  await expect(page.getByRole("textbox", { name: "Report title" })).toHaveValue("Coffee habits (demo): report");
  await expect(page.getByRole("heading", { name: "A pause that's mine" }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("switch", { name: "Public link" }).click();
  const link = page.getByRole("textbox", { name: "Public link" });
  await expect(link).toHaveValue(/\/r\//);
  const url = await link.inputValue();

  // Anyone with the link can read it, signed out.
  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(url);
  await expect(g.getByRole("heading", { level: 1, name: "Coffee habits (demo): report" })).toBeVisible();
  await expect(g.getByRole("button", { name: "Print or save as PDF" })).toBeVisible();
  await guest.close();
});

test("questionnaire from the brief", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await signIn(page, uniqueEmail(testInfo, "drafter"));
  await page.getByLabel("Workspace name").fill("Draft Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await page.getByRole("link", { name: /Coffee habits/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  await page.getByRole("button", { name: "New study" }).first().click();
  await page.getByLabel("Name").fill("Follow-up survey");
  await page.getByRole("button", { name: "Create study" }).click();
  await expect(page).toHaveURL(/\/s\//);
  await page.goto(`${page.url().match(/^.*\/s\/[^/?]+/)![0]}/build`);
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect(page.getByText("Drafted 7 questions")).toBeVisible();
  await expect(page.getByText("For regular drinkers, the pause matters more than the caffeine.").first()).toBeVisible();
});
