import { expect, test } from "@playwright/test";

test("draws, flips, writes, and returns a hard card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin" }).click();

  await expect(page.getByText("THE DECK AWAITS")).toBeVisible();
  await page.getByRole("button", { name: "Draw a card" }).click();

  const card = page.getByRole("button", { name: "Flip study card" });
  await expect(card).toContainText("ARCANE LATIN");
  const firstPrompt = await card.locator("h2").textContent();
  expect(firstPrompt).toBeTruthy();
  await card.click();
  await expect(card).toContainText("THE ANSWER");
  await expect(page.getByRole("button", { name: "Hard" })).toBeVisible({ timeout: 4_000 });

  await card.click();
  await expect(page.getByRole("button", { name: "Hard" })).not.toBeVisible();
  await card.click();
  await expect(page.getByRole("button", { name: "Hard" })).toBeVisible({ timeout: 500 });

  await page.getByRole("button", { name: "Hard" }).click();
  await expect.poll(() => card.locator("h2").textContent(), { timeout: 2_000 }).not.toBe(firstPrompt);
  await expect(page.getByText("THE DECK AWAITS")).not.toBeVisible();
});

test("places an Again card behind the next two entries", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => nativeTimeout(handler, timeout && timeout > 500 ? 5 : timeout, ...args)) as typeof window.setTimeout;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Begin" }).click();
  await page.getByRole("button", { name: "Draw a card" }).click();
  const card = page.getByRole("button", { name: "Flip study card" });
  const firstPrompt = await card.locator("h2").textContent();
  await card.click();
  await page.getByRole("button", { name: "Again" }).click();
  await expect.poll(() => card.locator("h2").textContent()).not.toBe(firstPrompt);
  const secondPrompt = await card.locator("h2").textContent();
  expect(secondPrompt).not.toBe(firstPrompt);
  await card.click();
  await page.getByRole("button", { name: "Good" }).click();
  await expect.poll(() => card.locator("h2").textContent()).not.toBe(secondPrompt);
  const thirdPrompt = await card.locator("h2").textContent();
  expect(thirdPrompt).not.toBe(firstPrompt);
  await card.click();
  await page.getByRole("button", { name: "Good" }).click();
  await expect(card.locator("h2")).toHaveText(firstPrompt ?? "");
});

test("captures the main study states", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.screenshot({ path: testInfo.outputPath("home.png"), fullPage: true });
  await page.getByRole("button", { name: "Begin" }).click();
  await page.screenshot({ path: testInfo.outputPath("deck.png"), fullPage: true });

  await page.getByRole("button", { name: "Draw a card" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("question.png"), fullPage: true });

  await page.getByRole("button", { name: "Flip study card" }).click();
  await expect(page.getByRole("button", { name: "Hard" })).toBeVisible({ timeout: 4_000 });
  await page.screenshot({ path: testInfo.outputPath("answer.png"), fullPage: true });
});

test("persists difficulty and active imported decks", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Decks" }).click();
  await expect(page.getByRole("button", { name: "Study Norwegian deck" })).toContainText("496 cards");
  await expect(page.getByRole("button", { name: "Study Tamil deck" })).toContainText("18 cards");
  await page.getByRole("button", { name: "Activate Norwegian deck" }).click();
  await expect(page.getByRole("button", { name: "Deactivate Norwegian deck" })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: testInfo.outputPath("library.png"), fullPage: true });

  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("button", { name: /Adept/ }).click();
  await page.getByLabel(/Tamil/).check();
  await page.reload();

  await page.getByRole("button", { name: "Profile" }).click();
  await expect(page.getByRole("button", { name: /Adept/ })).toHaveClass(/selected/);
  await expect(page.getByLabel(/Tamil/)).toBeChecked();
  await expect(page.getByLabel(/Norwegian/)).toBeChecked();
  await page.screenshot({ path: testInfo.outputPath("profile.png"), fullPage: true });

  await page.getByRole("button", { name: "Decks" }).click();
  await page.getByRole("button", { name: "Study Tamil deck" }).click();
  await page.getByRole("button", { name: "Draw a card" }).click();
  await expect(page.getByRole("button", { name: "Flip study card" })).toContainText("ARCANE TAMIL");
});

test("three-heart mode becomes non-blocking practice", async ({ page }) => {
  await page.addInitScript(() => {
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => nativeTimeout(handler, timeout && timeout > 500 ? 5 : timeout, ...args)) as typeof window.setTimeout;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("button", { name: /Adept/ }).click();
  await page.getByRole("button", { name: "Home" }).click();
  await page.getByRole("button", { name: "Begin" }).click();
  await page.getByRole("button", { name: "Draw a card" }).click();

  const card = page.getByRole("button", { name: "Flip study card" });
  await card.click();
  await expect(page.getByRole("button", { name: "Again" })).toBeVisible({ timeout: 4_000 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole("button", { name: "Again" }).click();
    if (attempt < 2) {
      await card.click();
      await expect(page.getByRole("button", { name: "Again" })).toBeVisible({ timeout: 1_500 });
    }
  }
  await expect(page.getByText(/Practice mode/)).toBeVisible();
  await card.click();
  await expect(page.getByRole("button", { name: "Easy ✓" })).toBeVisible({ timeout: 1_500 });
});

test("edits deck identity, sigil, and cards locally", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Decks" }).click();
  await page.getByRole("button", { name: "Edit Biology deck" }).click();
  const editor = page.getByRole("dialog", { name: "Edit Biology deck" });
  await editor.getByLabel("Name").fill("Living Systems");
  await editor.getByRole("button", { name: /Engineering/ }).click();
  await editor.getByRole("button", { name: "+ Add card" }).click();
  await editor.getByLabel("Front").first().fill("What carries voltage through a circuit?");
  await editor.getByLabel("Back").first().fill("Electric current.");
  await page.screenshot({ path: testInfo.outputPath("deck-editor.png"), fullPage: true });
  await editor.getByRole("button", { name: "Save deck" }).click();

  await expect(page.getByRole("button", { name: "Study Living Systems deck" })).toContainText("11 cards");
  await page.reload();
  await page.getByRole("button", { name: "Decks" }).click();
  await page.getByRole("button", { name: "Edit Living Systems deck" }).click();
  await page.getByPlaceholder("Search prompts and answers").fill("voltage");
  await expect(page.getByLabel("Front")).toHaveValue("What carries voltage through a circuit?");
  await expect(page.getByRole("img", { name: "Engineering sigil" }).first()).toBeVisible();
});

test("renders upgraded due cards and persists weighted XP", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const cards = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [`latin:latin-${index + 1}`, { intervalDays: 1, ease: 2.5, dueAt: 0, lastReviewedAt: 0, successes: 0, failures: 9 }]));
    localStorage.setItem("opus-pusillium:learner:v1", JSON.stringify({ version: 1, difficulty: "adventurer", experience: 0, streak: 0, lastStudyDate: null, cards, decks: {}, deckEdits: {} }));
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Begin" }).click();
  await page.getByRole("button", { name: "Draw a card" }).click();
  const card = page.getByRole("button", { name: "Flip study card" });
  await expect(card).toHaveClass(/status-due/);
  await expect(card).toHaveClass(/rank-3/);
  await card.click();
  await expect(page.getByRole("button", { name: "Hard" })).toContainText("+18 XP", { timeout: 4_000 });
  await page.screenshot({ path: testInfo.outputPath("ranked-due-card.png"), fullPage: true });
  await page.getByRole("button", { name: "Hard" }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("opus-pusillium:learner:v1") ?? "{}").experience)).toBe(18);
  await page.locator(".study header .icon-button").click();
  await page.getByRole("button", { name: "Home" }).click();
  await expect(page.getByText(/18 XP/)).toBeVisible();
});

test("spends Easy-answer Momentum on a bonus-card batch", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    const nativeTimeout = window.setTimeout.bind(window);
    window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => nativeTimeout(handler, timeout && timeout > 500 ? 5 : timeout, ...args)) as typeof window.setTimeout;
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Decks" }).click();
  await page.getByRole("button", { name: "Study Tamil deck" }).click();
  await page.getByRole("button", { name: "Draw a card" }).click();
  const card = page.getByRole("button", { name: "Flip study card" });
  for (let index = 0; index < 10; index += 1) {
    await card.click();
    await page.getByRole("button", { name: "Easy ✓" }).click();
  }
  await expect(page.getByText("MOMENTUM GATHERED")).toBeVisible();
  await page.getByLabel("Bonus cards to draw").fill("3");
  await page.screenshot({ path: testInfo.outputPath("momentum-slider.png"), fullPage: true });
  await page.getByRole("button", { name: "Spend 6 · Draw 3 bonus cards" }).click();
  await expect(card).toBeVisible();
  await expect(page.getByLabel("4 momentum")).toBeVisible();
  await expect(page.getByText("10 / 13")).toBeVisible();
});
