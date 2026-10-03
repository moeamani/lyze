import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildDocx } from "../helpers/docx";
import { expectNoHorizontalScroll, signIn, uniqueUser } from "./helpers";

/** Write a made-up .docx to a temp file for the file picker. */
function docxFile(name: string, content: Parameters<typeof buildDocx>[0]) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lyze-")), name);
  fs.writeFileSync(file, buildDocx(content));
  return file;
}

test("Word transcripts and codebooks, and patterns across interviews", async ({ page }, testInfo) => {
  await signIn(page, uniqueUser(testInfo, "imports"));
  await page.getByLabel("Workspace name").fill("Imports Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.getByRole("link", { name: /Café regulars/ }).first().click();
  await expect(page).toHaveURL(/\/s\//);
  const study = page.url().match(/^.*\/s\/[^/?]+/)![0];
  const project = page.url().match(/^.*\/p\/[^/?]+/)![0];

  // Bulk import: a hand-typed focus group transcript in Word.
  const transcript = docxFile("Copy of Workshop 2.docx", [
    "Workshop 2 - clean transcription",
    "1 (00:01:05) - Nadia: Welcome. What brought you here?",
    "",
    "2 (00:01:40) - Omar: Ideas I can use on Monday.",
    "",
    "3 (00:02:10) - Lena: Engagement, mostly.",
    "",
    "4 (00:02:30) - Leena:Same here.",
    "",
    "5 (00:03:00) - Multiple people: xxx",
    "",
    "6 (00:03:20) - Lena: And tasks that feel real.",
  ]);
  await page.goto(`${study}/sessions`);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Import transcripts" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(transcript);
  await expect(dialog.getByRole("textbox", { name: "Session title" })).toHaveValue("Workshop 2 - clean transcription");
  await expect(dialog.getByText("Merged into Lena")).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "Role of Nadia" })).toContainText("Interviewer");
  await expect(dialog.getByRole("combobox", { name: "Role of Multiple people" })).toContainText("Other");
  await expectNoHorizontalScroll(page);
  await dialog.getByRole("button", { name: "Import 1 transcript" }).click();
  await expect(page.getByText("1 session imported")).toBeVisible();
  await page.getByRole("link", { name: /Workshop 2/ }).click();
  await expect(page.getByRole("heading", { name: "Workshop 2 - clean transcription" })).toBeVisible();
  await expect(page.getByText("Engagement, mostly.")).toBeVisible();
  await page.goto(`${study}/participants`);
  // Phones show people as cards, larger screens as a table: check the text either way.
  await expect(page.getByRole("main").getByText("Lena", { exact: true }).locator("visible=true").first()).toBeVisible();
  await expect(page.getByRole("main").getByText("Leena", { exact: true })).toHaveCount(0);

  // A codebook written in Word, as a table.
  const codebook = docxFile("codebook.docx", [{ text: "Codebook", style: "Title" }, { table: [["Category", "Code", "Definition"], ["Teaching", "Task design", "How tasks are planned"], ["", "Feedback", "How students hear how they did"]] }]);
  await page.goto(`${project}/codebook`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Generate or upload codes").click();
  await page.locator('input[type="file"][accept*=".docx"]').setInputFiles(codebook);
  await expect(page.getByText("Imported 3")).toBeVisible();
  await expect(page.getByText("Task design")).toBeVisible();

  // Patterns: the demo participants have an age group to compare by.
  await page.goto(`${project}/patterns`);
  await expect(page.getByRole("table", { name: /Codes by/ })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "p (Holm)" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("tab", { name: "Codes together" }).click();
  await expect(page.getByRole("columnheader", { name: "Passages together" })).toBeVisible();
  await page.getByRole("tab", { name: "Coder agreement" }).click();
  await expect(page.getByText(/Agreement needs two people coding/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Codes by participant (CSV)" })).toHaveAttribute("href", /format=cases/);
});
