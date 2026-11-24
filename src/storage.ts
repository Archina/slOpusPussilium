import { useEffect, useState } from "react";
import type { LearnerState } from "./types";

const STORAGE_KEY = "opus-pusillium:learner:v1";

export const todayKey = (date = new Date()) => date.toISOString().slice(0, 10);

export const defaultLearnerState = (): LearnerState => ({
  version: 1,
  difficulty: "adventurer",
  experience: 0,
  streak: 0,
  lastStudyDate: null,
  cards: {},
  decks: {},
  deckEdits: {},
  librarySort: { field: "name", direction: "asc" },
});

function loadState(): LearnerState {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (!value) return defaultLearnerState();
    const parsed = JSON.parse(value) as Partial<LearnerState> & { points?: number };
    return { ...defaultLearnerState(), ...parsed, experience: parsed.experience ?? parsed.points ?? 0, cards: parsed.cards ?? {}, decks: parsed.decks ?? {}, deckEdits: parsed.deckEdits ?? {}, librarySort: parsed.librarySort ?? { field: "name", direction: "asc" } };
  } catch {
    return defaultLearnerState();
  }
}

export function useLearnerState() {
  const [state, setState] = useState<LearnerState>(loadState);
  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(state)), [state]);
  return [state, setState] as const;
}
