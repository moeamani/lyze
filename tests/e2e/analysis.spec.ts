import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

/** Sign up with the demo project, which ships with 48 seeded responses to the coffee survey. */
async function openDemoSurvey(page: Page, testInfo: TestInfo) {
  await signIn(page, uniqueEmail(testInfo, "analyst"));
  await page.getByLabel("Workspace name").fill("Analysis Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.getByRole("link", { name: /Morning coffee survey/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Morning coffee survey" })).toBeVisible();
}

/** Pickers write to the URL; wait for each choice to land before making the next. */
async function pick(page: Page, label: string, option: string | RegExp, param: string) {
  await page.getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]${param}=`));
}

test("results summarize the demo survey with charts and tables", async ({ page }, testInfo) => {
  await openDemoSurvey(page, testInfo);
  await page.getByRole("link", { name: "Results", exact: true }).click();

  await expect(page.getByText("Responses analyzed")).toBeVisible();
  await expect(page.getByText("45", { exact: true }).first()).toBeVisible();
  const q2 = page.locator("#q2");
  await expect(q2).toBeVisible();

  // Every chart has a table view.
  await q2.getByRole("radio", { name: "Table" }).click();
  await expect(q2.getByRole("table")).toBeVisible();
  await expect(q2.getByRole("cell", { name: "Black" })).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("analyze tools run tests and show R/SPSS syntax; exports download", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Tool pickers are exercised on desktop");
  await openDemoSurvey(page, testInfo);
  const studyUrl = page.url().replace(/\/(overview)?$/, "");
  const studyId = studyUrl.match(/\/s\/([^/?]+)/)![1]!;

  // Compare groups: four groups → one-way ANOVA.
  await page.getByRole("link", { name: "Analyze" }).click();
  await page.getByRole("link", { name: "Compare groups" }).click();
  await pick(page, "Outcome (score)", /Q6 · I'd like to drink less coffee/, "y");
  await pick(page, "Groups", /Q2 · How do you usually take it/, "group");
  await expect(page.getByText("One-way ANOVA").first()).toBeVisible();
  await expect(page.getByText("How to report it")).toBeVisible();
  const syntax = page.getByRole("button", { name: /Reproduce in R \/ SPSS/ });
  if ((await syntax.getAttribute("aria-expanded")) !== "true") await syntax.click();
  await expect(page.getByText(/aov\(/).first()).toBeVisible();

  // Correlation: cups vs wanting to drink less is seeded to correlate.
  await page.getByRole("link", { name: "Correlation", exact: true }).click();
  await pick(page, "Variable X", /Q1 · How many cups/, "x");
  await pick(page, "Variable Y", /Q6 · I'd like to drink less coffee/, "y");
  await expect(page.getByText("Statistically significant", { exact: true })).toBeVisible();
  await expect(page.getByText("Pearson r")).toBeVisible();

  // Exports: SPSS .sav, REFI-QDA project (NVivo / ATLAS.ti / MAXQDA), Excel, R bundle.
  const sav = await page.request.get(`/api/studies/${studyId}/export?format=sav`);
  expect(sav.status()).toBe(200);
  expect(sav.headers()["content-disposition"]).toMatch(/\.sav$/);
  expect((await sav.body()).subarray(0, 4).toString("latin1")).toBe("$FL2");
  for (const format of ["qdpx", "xlsx", "r"]) {
    const res = await page.request.get(`/api/studies/${studyId}/export?format=${format}`);
    expect(res.status(), format).toBe(200);
    expect((await res.body()).subarray(0, 2).toString("latin1"), format).toBe("PK");
  }
  const csv = await page.request.get(`/api/studies/${studyId}/export?format=csv`);
  const text = await csv.text();
  expect(text).toMatch(/^\uFEFFresponse_id,status,/);
  expect(text).toContain("Espresso drinks");

  // Prepare data: counting unfinished responses changes what Results analyzes.
  await page.getByRole("link", { name: "Prepare data" }).click();
  await page.getByRole("switch", { name: "Include unfinished responses" }).click();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save rules" }).click();
  await expect(page.getByText("All changes saved")).toBeVisible();
  await page.getByRole("link", { name: "Results", exact: true }).click();
  await expect(page.getByText("48", { exact: true }).first()).toBeVisible();
});
