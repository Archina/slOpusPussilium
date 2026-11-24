import { expect, test } from "@playwright/test";
import { buildSession, cardKey, experienceForReview, freshProgress, rankForFailures, reviewCard } from "../src/scheduler";
import { defaultLearnerState } from "../src/storage";
import type { Deck } from "../src/types";

test("mixes due reviews with unseen cards", () => {
  const deck: Deck = {
    id: "mixture",
    name: "Mixture",
    domain: "Knowledge",
    symbol: "philosophy",
    description: "Scheduler fixture",
    questions: Array.from({ length: 20 }, (_, index) => ({ id: `card-${index}`, prompt: `Question ${index}`, answer: `Answer ${index}` })),
  };
  const state = defaultLearnerState();
  for (const card of deck.questions.slice(0, 10)) state.cards[cardKey(deck.id, card.id)] = { ...freshProgress(), dueAt: 0 };

  const session = buildSession(deck, state, 10);
  const due = session.filter((card) => state.cards[cardKey(deck.id, card.id)]).length;
  const unseen = session.length - due;

  expect(due).toBe(7);
  expect(unseen).toBe(3);
  expect(session.filter((card) => card.status === "due")).toHaveLength(7);
  expect(session.filter((card) => card.status === "unseen")).toHaveLength(3);
});

test("upgrades difficult cards and increases their experience value", () => {
  expect([0, 1, 2, 4, 5, 8, 9].map(rankForFailures)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  expect(experienceForReview("hard", 0)).toBe(6);
  expect(experienceForReview("hard", 3)).toBe(18);
  expect(experienceForReview("easy", 3)).toBe(6);
  expect(experienceForReview("hard", 3, true)).toBe(5);
});

test("uses Anki-like interval ordering", () => {
  const now = Date.now();
  const hard = reviewCard(freshProgress(now), "hard", now);
  const good = reviewCard(freshProgress(now), "good", now);
  const easy = reviewCard(freshProgress(now), "easy", now);
  expect(hard.dueAt).toBeLessThan(good.dueAt);
  expect(good.dueAt).toBeLessThan(easy.dueAt);
});
