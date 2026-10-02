import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

async function newSurvey(page: Page, testInfo: Parameters<Parameters<typeof test>[2]>[1], workspace: string) {
  await signIn(page, uniqueEmail(testInfo, "builder"));
  await page.getByLabel("Workspace name").fill(workspace);
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);

  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByRole("dialog").getByLabel("Name").fill("Commute study");
  await page.getByRole("dialog").getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Commute study" })).toBeVisible();

  await page.getByRole("button", { name: "New study" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: /Survey \/ form/ }).click();
  await dialog.getByLabel("Name").fill("How people get to work");
  await dialog.getByRole("button", { name: "Create study" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "How people get to work" })).toBeVisible();

  await page.getByRole("link", { name: "Open form builder" }).click();
  await expect(page.getByRole("heading", { name: "Start your form" })).toBeVisible();
  await page.getByRole("button", { name: /Blank form/ }).click();
  await expect(page.getByText("This page is empty.")).toBeVisible();
}

test("build a form, answer it on a phone, and see the response", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Building runs on desktop; answering runs on a 360px phone below");
  await newSurvey(page, testInfo, "Commute Lab");

  // Q1: required single choice.
  await page.getByRole("button", { name: "Add question" }).first().click();
  await page.getByRole("menuitem", { name: "Single choice" }).click();
  const panel = page.getByRole("complementary", { name: "Form settings" });
  await panel.getByLabel("Question", { exact: true }).fill("How do you usually get to work?");
  await panel.getByRole("textbox", { name: "Option 1" }).fill("Bike");
  await panel.getByRole("textbox", { name: "Option 2" }).fill("Bus");
  await panel.getByRole("textbox", { name: "Option 3" }).fill("Car");
  await panel.getByRole("switch", { name: "Required" }).click();

  // Q2: long text, qualitative by default, shown only to bus riders.
  await page.getByRole("button", { name: "Add question" }).first().click();
  await page.getByRole("menuitem", { name: "Long text" }).click();
  await panel.getByLabel("Question", { exact: true }).fill("What would make the bus better?");
  await panel.getByRole("button", { name: "Add rule" }).click();
  const rule = page.getByRole("dialog");
  await rule.getByRole("combobox", { name: "Value" }).click();
  await page.getByRole("option", { name: "Bus" }).click();
  await rule.getByRole("button", { name: "Save rule" }).click();
  await expect(panel.getByRole("button", { name: /Show question/ })).toBeVisible();

  // Q3 on a new page: NPS.
  await page.getByRole("button", { name: "Add page" }).click();
  await page.getByRole("button", { name: "Add question" }).last().click();
  await page.getByRole("menuitem", { name: "NPS (0–10)" }).click();
  await panel.getByLabel("Question", { exact: true }).fill("How likely are you to recommend your commute?");

  // Preview shows the logic working.
  await page.getByRole("radio", { name: "Preview" }).click();
  const preview = page.getByText("Preview — answers aren't saved").locator("..");
  await expect(preview.getByText("What would make the bus better?")).toBeHidden();
  await preview.getByText("Bus", { exact: true }).click();
  await expect(preview.getByText("What would make the bus better?")).toBeVisible();
  await page.getByRole("radio", { name: "Edit" }).click();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText(/Published version 1/)).toBeVisible();

  // Share page gives the public link.
  await page.getByRole("link", { name: "Back to study" }).click();
  await page.getByRole("link", { name: "Share", exact: true }).click();
  const link = await page.getByRole("textbox", { name: "Public link" }).inputValue();
  expect(link).toMatch(/\/f\/[a-z0-9]{10}$/);

  // Answer on a 360px phone.
  const phone = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const r = await phone.newPage();
  await r.goto(link);
  await expect(r.getByRole("heading", { level: 1, name: "How people get to work" })).toBeVisible();
  await expectNoHorizontalScroll(r);

  // Required question blocks progress with a friendly message.
  await r.getByRole("button", { name: "Next" }).click();
  await expect(r.getByText("This question needs an answer.")).toBeVisible();

  await r.getByText("Bus", { exact: true }).click();
  await r.getByLabel(/What would make the bus better/).fill("More frequent service in the evening.");
  await r.getByRole("button", { name: "Next" }).click();
  await r.getByRole("radio", { name: "9" }).check({ force: true });
  await r.getByRole("button", { name: "Submit" }).click();
  await expect(r.getByRole("heading", { name: "Thank you!" })).toBeVisible();
  await phone.close();

  // The team sees it.
  await page.getByRole("link", { name: "Responses", exact: true }).click();
  await expect(page.getByText(/Complete · 1/)).toBeVisible();
  await page.getByRole("link", { name: /View response/ }).first().click();
  await expect(page.getByText("More frequent service in the evening.")).toBeVisible();
  await expect(page.getByText("Bus", { exact: true })).toBeVisible();
});

test("the builder works on a phone with a full-height editing sheet", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Phone layout");
  await newSurvey(page, testInfo, "Phone Builder Lab");

  await page.getByRole("button", { name: "Add question" }).first().click();
  await page.getByRole("menuitem", { name: "Rating" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { level: 2, name: "Question" })).toBeVisible();
  await sheet.getByLabel("Question", { exact: true }).fill("How was your day?");
  await sheet.getByRole("button", { name: "Back to study" }).click();
  await expect(page.getByRole("button", { name: /How was your day\?/ }).last()).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.getByRole("radio", { name: "Preview" }).click();
  await expect(page.getByText("Preview — answers aren't saved")).toBeVisible();
  await expect(page.getByRole("radio", { name: "3 of 5" })).toBeAttached();
});

test("respondents can save and come back later", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "One run is enough");
  await signIn(page, uniqueEmail(testInfo, "resume"));
  await page.getByLabel("Workspace name").fill("Resume Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  // The demo survey is published out of the box.
  await page.getByRole("link", { name: /Morning coffee survey/ }).click();
  await page.getByRole("link", { name: "Share", exact: true }).click();
  const link = await page.getByRole("textbox", { name: "Public link" }).inputValue();

  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const r = await ctx.newPage();
  await r.goto(link);
  await r.getByRole("spinbutton", { name: /How many cups/ }).fill("3");
  await r.getByRole("button", { name: "Next" }).click();
  await expect(r.getByRole("heading", { name: "Page 2 of 2" })).toBeAttached();
  await expect(r.getByText(/Progress saved/)).toBeVisible();

  // Coming back to the same link offers to continue.
  await r.goto(link);
  await expect(r.getByText("Welcome back! You can pick up where you left off.")).toBeVisible();
  await r.getByRole("button", { name: "Continue" }).click();
  await expect(r.getByRole("heading", { name: "Page 2 of 2" })).toBeAttached();
  await r.getByRole("button", { name: "Back" }).click();
  await expect(r.getByRole("spinbutton", { name: /How many cups/ })).toHaveValue("3");
  await ctx.close();
});
