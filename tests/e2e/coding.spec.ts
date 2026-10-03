import { expect, test, type Page } from "@playwright/test";
import { expectNoHorizontalScroll, signIn, uniqueEmail } from "./helpers";

/** Select `phrase` inside a coding unit, the way a mouse drag would, and let the workspace pick it up. */
async function selectPhrase(page: Page, phrase: string) {
  await page.evaluate((phrase) => {
    for (const el of document.querySelectorAll<HTMLElement>("[data-unit-id]")) {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.textContent!.indexOf(phrase);
        if (at < 0) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + phrase.length);
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        return;
      }
    }
    throw new Error(`phrase not found: ${phrase}`);
  }, phrase);
}

test("code a transcript: highlight, new code, quotes, codebook and themes", async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo, "coder"));
  await page.getByLabel("Workspace name").fill("Coding Lab");
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(page).toHaveURL(/\/w\//);
  await page.getByRole("link", { name: /Coffee habits/ }).first().click();
  await expect(page).toHaveURL(/\/p\//);
  const base = page.url().match(/^.*\/p\/[^/?]+/)![0];

  // The demo project opens on its first transcript, already partly coded.
  await page.goto(`${base}/coding`);
  await expect(page.getByRole("heading", { name: "Interview · P02" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Select a phrase and create a new code for it from the picker.
  await selectPhrase(page, "If they put music on loud");
  const picker = page.getByRole("dialog", { name: "Code this passage" });
  await expect(picker).toBeVisible();
  await picker.getByRole("combobox").fill("Atmosphere");
  await picker.getByRole("option", { name: /Create code “Atmosphere”/ }).click();
  const passage = page.locator("article").filter({ hasText: "If they put music on loud" });
  await expect(passage.getByRole("button", { name: "Atmosphere" })).toBeVisible();
  await expect(passage.locator("mark", { hasText: "If they put music on loud" })).toBeVisible();

  // Apply an existing code to another phrase with the keyboard.
  await selectPhrase(page, "Kids first.");
  await picker.getByRole("combobox").fill("Rit");
  await picker.getByRole("combobox").press("Enter");
  await expect(page.locator("article").filter({ hasText: "Kids first." }).getByRole("button", { name: "Ritual" })).toBeVisible();

  // The demo has an assistant suggestion waiting; accepting it makes it a real coding.
  if (testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: "Accept all" }).click();
    await expect(page.locator("article").filter({ hasText: "decaf" }).getByRole("button", { name: "Cutting down" })).toBeVisible();
  }

  // The new passage is in the quote bank and the code is in the codebook.
  await page.goto(`${base}/quotes`);
  await expect(page.getByText("“If they put music on loud”")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto(`${base}/codebook`);
  await expect(page.getByRole("button", { name: /Atmosphere/ }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Themes board shows the seeded themes, and the new code waits in "Unsorted".
  await page.goto(`${base}/themes`);
  await expect(page.getByText("A pause that's mine")).toBeVisible();
  await expect(page.getByText("Atmosphere")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Search finds the passage by its exact phrase.
  await page.goto(`${base}/search?q=${encodeURIComponent('"music on loud"')}`);
  await expect(page.getByText("1 result")).toBeVisible();
  await expectNoHorizontalScroll(page);
});
