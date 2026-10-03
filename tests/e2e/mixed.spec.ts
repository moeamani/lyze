import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

test("mixed methods, written analysis, groups, notifications and activity", async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo, "mixed"));
  await page.getByLabel("Workspace name").fill("Mixed Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  const ws = page.url().match(/^.*\/w\/[^/?]+/)![0];

  // Projects sit in custom groups.
  await page.goto(`${ws}/projects`);
  await expect(page.getByRole("button", { name: /^Examples/ })).toBeVisible();
  await expect(page.getByText("2 studies")).toBeVisible();
  await page.getByRole("button", { name: "New group" }).click();
  await page.getByRole("textbox", { name: "Group name" }).fill("Thesis");
  await page.getByRole("button", { name: "Create" }).click();
  await page.getByRole("button", { name: /Move Coffee habits/ }).click();
  await page.getByRole("menuitem", { name: "Thesis" }).click();
  await expect(page.getByRole("region", { name: "Thesis" }).getByText("Coffee habits (demo)")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: /Coffee habits/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const base = page.url().match(/^.*\/p\/[^/?]+/)![0];

  // Joint display, codes × answers and people.
  await page.goto(`${base}/mixed`);
  await expect(page.getByRole("heading", { name: "Where the conversations and the survey meet" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Pause/ }).getByText("Both")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("tab", { name: "Codes × answers" }).click();
  await expect(page.getByRole("row", { name: /All respondents/ })).toBeVisible();
  await page.getByRole("tab", { name: "People" }).click();
  await expect(page.getByText("2 of 5 participants appear in both")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // The brief frames a written analysis; re-reading the demo proposal finds nothing new.
  await page.goto(`${base}/writeup`);
  await page.locator('input[type="file"]').setInputFiles("tests/fixtures/proposal.pdf");
  await expect(page.getByText(/Read the file: the aim, 3 research questions and 3 hypotheses/)).toBeVisible();
  await expect(page.getByText("proposal.pdf")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Research question 1" })).toHaveValue(/ritual/);
  await page.getByRole("button", { name: "Add a research question" }).click();
  await page.getByRole("textbox", { name: "Research question 4" }).fill("Where do people drink their coffee?");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Brief saved")).toBeVisible();
  await page.getByRole("button", { name: "Write analysis" }).click();
  await expect(page).toHaveURL(/\/writeup\/wrt/);
  await expect(page.getByRole("heading", { name: "Coffee habits (demo): data analysis and results" })).toBeVisible();
  await expect(page.getByText(/asked: Where do people drink their coffee\?/)).toBeVisible();
  await expect(page.getByText("Table 1.")).toBeVisible();
  expect(await page.locator("article").innerText()).not.toMatch(/[–—]/);
  await expectNoHorizontalScroll(page);

  // Notifications: the demo leaves two unread.
  await page.getByRole("button", { name: "Notifications, 2 unread" }).first().click();
  await expect(page.getByRole("menuitem", { name: /48 new responses/ })).toBeVisible();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Notifications", exact: true }).first()).toBeVisible();

  // Activity filters by type.
  await page.goto(`${ws}/activity?cat=writeup`);
  await expect(page.getByText(/wrote a draft analysis/)).toBeVisible();
  await expect(page.getByText(/created project/)).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("Persian is right-to-left in Peyda", async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await context.addCookies([{ name: "NEXT_LOCALE", value: "fa", url: testInfo.project.use.baseURL ?? "http://localhost:3200" }]);
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "fa");
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font).toMatch(/peyda/i);
  await expectNoHorizontalScroll(page);
});
