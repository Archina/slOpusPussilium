import type { CardProgress, Deck, LearnerState, Rating, SessionCard, StudyCard } from "./types";

const DAY = 86_400_000;
export const MOMENTUM_COST = 2;

export const cardKey = (deckId: string, cardId: string) => `${deckId}:${cardId}`;

export function freshProgress(now = Date.now()): CardProgress {
  return { intervalDays: 0, ease: 2.5, dueAt: now, lastReviewedAt: 0, successes: 0, failures: 0 };
}

export function reviewCard(previous: CardProgress | undefined, rating: Rating, now = Date.now()): CardProgress {
  const card = previous ?? freshProgress(now);
  if (rating === "again") return { ...card, intervalDays: 0, ease: Math.max(1.3, card.ease - 0.2), dueAt: now, lastReviewedAt: now, failures: card.failures + 1 };
  if (rating === "hard") {
    const intervalDays = Math.max(1, card.intervalDays || 1);
    return { ...card, intervalDays, ease: Math.max(1.3, card.ease - 0.1), dueAt: now + intervalDays * DAY, lastReviewedAt: now, successes: card.successes + 1 };
  }
  if (rating === "good") {
    const intervalDays = card.intervalDays === 0 ? 2 : Math.max(2, Math.round(card.intervalDays * card.ease));
    return { ...card, intervalDays, dueAt: now + intervalDays * DAY, lastReviewedAt: now, successes: card.successes + 1 };
  }
  const intervalDays = card.intervalDays === 0 ? 4 : Math.max(3, Math.round(card.intervalDays * card.ease * 1.3));
  return { ...card, intervalDays, ease: Math.min(3, card.ease + 0.15), dueAt: now + intervalDays * DAY, lastReviewedAt: now, successes: card.successes + 1 };
}

export function rankForFailures(failures: number): 0 | 1 | 2 | 3 {
  return failures >= 9 ? 3 : failures >= 5 ? 2 : failures >= 2 ? 1 : 0;
}

export function experienceForReview(rating: Rating, rank: 0 | 1 | 2 | 3, reduced = false) {
  const base = { again: 1, hard: 6, good: 4, easy: 2 }[rating];
  const full = Math.round(base * [1, 1.5, 2, 3][rank]);
  return reduced ? Math.max(1, Math.round(full * .25)) : full;
}

export function buildSession(deck: Deck, state: LearnerState, limit = 10): SessionCard[] {
  const now = Date.now();
  const shuffled = [...deck.questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  const due = shuffled.filter((card) => {
    const progress = state.cards[cardKey(deck.id, card.id)];
    return progress && progress.dueAt <= now;
  });
  const unseen = shuffled.filter((card) => !state.cards[cardKey(deck.id, card.id)]);
  const future = shuffled.filter((card) => {
    const progress = state.cards[cardKey(deck.id, card.id)];
    return progress && progress.dueAt > now;
  });
  const unseenTarget = due.length > 0 && unseen.length > 0 ? Math.max(2, Math.round(limit * 0.3)) : unseen.length > 0 ? limit : 0;
  const selected = [...due.slice(0, limit - unseenTarget), ...unseen.slice(0, unseenTarget)];
  const selectedIds = new Set(selected.map((card) => card.id));
  const fillers = [...due, ...unseen, ...future].filter((card) => !selectedIds.has(card.id));
  selected.push(...fillers.slice(0, limit - selected.length));
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [selected[index], selected[swapIndex]] = [selected[swapIndex], selected[index]];
  }
  return selected.map((card) => {
    const progress = state.cards[cardKey(deck.id, card.id)];
    const failures = progress?.failures ?? 0;
    return { ...card, status: !progress ? "unseen" : progress.dueAt <= now ? "due" : "scheduled", failures, rank: rankForFailures(failures) };
  });
}

export function mastery(deck: Deck, state: LearnerState) {
  const learned = deck.questions.filter((card) => (state.cards[cardKey(deck.id, card.id)]?.successes ?? 0) > 0).length;
  return Math.round(learned / deck.questions.length * 100);
}

export function dueCount(deck: Deck, state: LearnerState) {
  const now = Date.now();
  return deck.questions.filter((card) => {
    const progress = state.cards[cardKey(deck.id, card.id)];
    return !progress || progress.dueAt <= now;
  }).length;
}
