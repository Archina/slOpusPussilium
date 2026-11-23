import { expect, test } from "@playwright/test";

test("draws, flips, writes, and returns a hard card", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin" }).click();

  await expect(page.getByText("THE DECK AWAITS")).toBeVisible();
  await page.getByRole("button", { name: "Draw a card" }).click();

  const card = page.getByRole("button", { name: "Flip study card" });
  await expect(card).toContainText("What does per aspera ad astra mean?");
  await card.click();
  await expect(card).toContainText("Through hardships to the stars.");
  await expect(page.getByRole("button", { name: "Hard" })).toBeVisible({ timeout: 4_000 });

  await card.click();
  await expect(page.getByRole("button", { name: "Hard" })).not.toBeVisible();
  await card.click();
  await expect(page.getByRole("button", { name: "Hard" })).toBeVisible({ timeout: 500 });

  await page.getByRole("button", { name: "Hard" }).click();
  await expect(page.getByRole("button", { name: "Flip study card" })).toContainText("Translate: carpe diem.", { timeout: 2_000 });
  await expect(page.getByText("THE DECK AWAITS")).not.toBeVisible();
});

test("captures the main study states", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Begin" }).click();
  await page.screenshot({ path: testInfo.outputPath("deck.png"), fullPage: true });

  await page.getByRole("button", { name: "Draw a card" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath("question.png"), fullPage: true });

  await page.getByRole("button", { name: "Flip study card" }).click();
  await expect(page.getByRole("button", { name: "Hard" })).toBeVisible({ timeout: 4_000 });
  await page.screenshot({ path: testInfo.outputPath("answer.png"), fullPage: true });
});
