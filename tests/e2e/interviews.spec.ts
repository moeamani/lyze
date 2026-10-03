import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

/** A short 16-bit mono WAV tone, so uploads and playback work without fixtures on disk. */
function wav(seconds: number) {
  const rate = 8000;
  const n = rate * seconds;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((i / rate) * 2 * Math.PI * 220) * 2000), 44 + i * 2);
  return buf;
}

async function openDemoInterviews(page: Page, testInfo: TestInfo) {
  await signIn(page, uniqueEmail(testInfo, "interviewer"));
  await page.getByLabel("Workspace name").fill("Interview Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.getByRole("link", { name: /Café regulars interviews/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Café regulars interviews" })).toBeVisible();
  return page.url();
}

test("demo interviews: guide, participants, transcript and consent on any screen", async ({ page }, testInfo) => {
  const base = await openDemoInterviews(page, testInfo);
  await expectNoHorizontalScroll(page);

  await page.goto(`${base}/guide`);
  await expect(page.getByText("25 min planned")).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto(`${base}/participants`);
  await expect(page.getByText("Maya Chen").filter({ visible: true })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto(`${base}/sessions`);
  await expect(page.getByText("Up next")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // A finished interview: transcript with participant codes and inline notes.
  await page.getByRole("link", { name: /Interview · P01/ }).click();
  await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible();
  await expect(page.getByText("the only four minutes in the day that are mine").first()).toBeVisible();
  await page.getByRole("searchbox", { name: "Search transcript" }).fill("smartwatch");
  await expect(page.getByText("1 of 1")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // P03 signs the consent form from their personal link.
  await page.goto(`${base}/participants`);
  await page.getByRole("link", { name: /P03/ }).filter({ visible: true }).click();
  const link = await page.getByRole("textbox", { name: "Personal consent link" }).inputValue();
  await page.goto(link);
  await page.getByRole("button", { name: "I agree — sign" }).click();
  await expect(page.getByText("Please tick every statement to continue.")).toBeVisible();
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "I agree — sign" }).click();
  await expect(page.getByText("Thank you!")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto(link);
  await expect(page.getByText("You've already signed this form.")).toBeVisible();
});

test("run an interview: add a participant, record notes live, upload, transcribe and play back", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Recording and transcript editing run on desktop");
  const base = await openDemoInterviews(page, testInfo);

  // Add someone new.
  await page.goto(`${base}/participants`);
  await page.getByRole("button", { name: "Add participant" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Rosa Diaz");
  await dialog.getByRole("button", { name: "Add participant" }).click();
  await expect(page.getByRole("heading", { name: "Rosa Diaz" })).toBeVisible();
  await expect(page.getByText("P06", { exact: true })).toBeVisible();

  // Schedule a session for them.
  await page.getByRole("link", { name: "Schedule a session" }).click();
  const sessionDialog = page.getByRole("dialog");
  await sessionDialog.getByRole("radio", { name: /P06/ }).check();
  await sessionDialog.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByRole("heading", { name: "Interview · P06" })).toBeVisible();
  const sessionUrl = page.url();

  // Live: timer and quick notes.
  await page.getByRole("link", { name: "Start session" }).click();
  await page.getByRole("button", { name: "Start timer only" }).click();
  await page.getByRole("textbox", { name: "Add note" }).filter({ visible: true }).fill("#pricing would pay more for less hassle");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^Quote/ }).filter({ visible: true }).click();
  await expect(page.getByText("would pay more for less hassle").filter({ visible: true })).toBeVisible();
  await page.getByRole("button", { name: "End session" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "End session" }).click();
  await expect(page).toHaveURL(sessionUrl);
  await expect(page.getByText("Completed").first()).toBeVisible();

  // Upload a recording; the mock provider transcribes it from the guide.
  await page.getByTestId("media-input").setInputFiles({ name: "p06.wav", mimeType: "audio/wav", buffer: wav(60) });
  await expect(page.getByRole("heading", { name: "Transcript" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Walk me through your morning, from waking up to starting work.").first()).toBeVisible();

  // Clicking a timestamp plays from there and highlights the segment.
  const stamp = page.getByRole("button", { name: /^Play from 00:1/ }).first();
  await stamp.click();
  await expect(page.locator("li[aria-current=true]")).toBeVisible();
  const time = await page.locator("audio").evaluate((el: HTMLAudioElement) => el.currentTime);
  expect(time).toBeGreaterThanOrEqual(10);

  // Fix a transcription mistake.
  const first = page.locator("section[aria-labelledby='transcript-title'] li[data-index='1']");
  await first.hover();
  await first.getByRole("button", { name: /Edit segment/ }).click();
  await page.getByRole("textbox", { name: "Text" }).fill("Corrected by a human.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Corrected by a human.")).toBeVisible();

  // Range requests make seeking possible; transcripts download as text and subtitles.
  const src = await page.locator("audio").getAttribute("src");
  const ranged = await page.request.get(src!, { headers: { range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect((await ranged.body()).length).toBe(100);
  const sessionId = sessionUrl.split("/").at(-1);
  const vtt = await page.request.get(`/api/sessions/${sessionId}/transcript?format=vtt`);
  expect(await vtt.text()).toMatch(/^WEBVTT/);
  expect(await vtt.text()).toContain("Corrected by a human.");
});

test("write field notes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "Written entries are exercised on a phone");
  const base = await openDemoInterviews(page, testInfo);
  await page.goto(`${base}/sessions`);
  await page.getByRole("button", { name: "New session" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Field notes" }).click();
  await dialog.getByLabel(/Notes/).fill("Long queue at 8:05.\n\nMost people order the same thing every day.");
  await dialog.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByRole("heading", { name: "Field notes" })).toBeVisible();
  await expect(page.getByLabel("Field notes")).toHaveValue(/Most people order the same thing/);
  await expectNoHorizontalScroll(page);
});
