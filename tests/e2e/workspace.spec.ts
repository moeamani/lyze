import { expect, test } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

test("new researcher signs in, sets up a workspace, and creates a project and study", async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === "mobile";
  await signIn(page, uniqueEmail(testInfo, "researcher"));

  // Onboarding: first workspace, with the demo project.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Workspace name").fill("Wellbeing Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();

  // Dashboard shows the demo studies.
  await expect(page).toHaveURL(/\/w\/wellbeing-lab/);
  await expect(page.getByRole("heading", { name: /Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Morning coffee survey/ })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Navigation adapts to the viewport.
  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Projects" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeHidden();
  } else {
    await expect(page.getByRole("complementary", { name: "Sidebar" })).toBeVisible();
  }

  // Create a project.
  await page.getByRole("button", { name: "New project" }).first().click();
  const projectDialog = page.getByRole("dialog");
  await projectDialog.getByLabel("Name").fill("Student wellbeing");
  await projectDialog.getByLabel(/Description/).fill("How first-years settle in.");
  await projectDialog.getByRole("radio", { name: "Emerald" }).click();
  await projectDialog.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Student wellbeing" })).toBeVisible();
  await expect(page.getByText("No studies in this project yet")).toBeVisible();

  // Create an interview study inside it.
  await page.getByRole("button", { name: "New study" }).first().click();
  const studyDialog = page.getByRole("dialog");
  await studyDialog.getByRole("radio", { name: /Interview/ }).click();
  await studyDialog.getByLabel("Name").fill("Week-one interviews");
  await studyDialog.getByRole("button", { name: "Create study" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Week-one interviews" })).toBeVisible();

  // Make it live.
  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Live" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Study saved")).toBeVisible();

  // The activity log records what happened.
  if (isMobile) await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Activity" }).click();
  else await page.getByRole("complementary", { name: "Sidebar" }).getByRole("link", { name: "Activity" }).click();
  await expect(page.getByText(/set “Week-one interviews” to Live/)).toBeVisible();
  await expect(page.getByText(/created project “Student wellbeing”/)).toBeVisible();
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/w/anything");
  await expect(page).toHaveURL(/\/sign-in\?callbackUrl=/);
  await expect(page.getByRole("heading", { name: "Welcome to Lyze" })).toBeVisible();
});

test("command palette opens with the keyboard", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Keyboard shortcut is a desktop affordance");
  await signIn(page, uniqueEmail(testInfo, "palette"));
  await page.getByLabel("Workspace name").fill("Palette Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\/palette-lab/);

  await page.keyboard.press("ControlOrMeta+k");
  const palette = page.getByRole("dialog");
  await expect(palette.getByPlaceholder("Type a command or search…")).toBeVisible();
  await palette.getByPlaceholder("Type a command or search…").fill("members");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/settings\/members/);
  await expect(page.getByRole("heading", { level: 1, name: "Members" })).toBeVisible();
});

test("Arabic renders right-to-left without sideways scrolling", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "ar", url: baseURL! }]);
  await page.goto("/sign-in");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await expect(page.getByRole("heading", { name: "مرحبًا بك في Lyze" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});
