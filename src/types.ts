export type Rating = "again" | "hard" | "good" | "easy";
export type CardStatus = "unseen" | "due" | "scheduled";
export type DifficultyMode = "adventurer" | "scholar" | "adept";
export type LibrarySort = { field: "name" | "size"; direction: "asc" | "desc" };
export type DomainSymbolId = "language" | "nordic" | "life" | "chemistry" | "physics" | "mathematics" | "astronomy" | "medicine" | "computing" | "engineering" | "history" | "philosophy" | "arts";

export type StudyCard = {
  id: string;
  prompt: string;
  answer: string;
};

export type SessionCard = StudyCard & {
  status: CardStatus;
  failures: number;
  rank: 0 | 1 | 2 | 3;
};

export type Deck = {
  id: string;
  name: string;
  domain: string;
  symbol: DomainSymbolId;
  description: string;
  questions: StudyCard[];
};

export type DeckEdit = {
  name: string;
  domain: string;
  symbol: DomainSymbolId;
  description: string;
  questions?: StudyCard[];
};

export type CardProgress = {
  intervalDays: number;
  ease: number;
  dueAt: number;
  lastReviewedAt: number;
  successes: number;
  failures: number;
};

export type DeckProgress = {
  active: boolean;
  sessionDate: string;
  sessionsCompleted: number;
};

export type LearnerState = {
  version: 1;
  difficulty: DifficultyMode;
  experience: number;
  streak: number;
  lastStudyDate: string | null;
  cards: Record<string, CardProgress>;
  decks: Record<string, DeckProgress>;
  deckEdits: Record<string, DeckEdit>;
  librarySort: LibrarySort;
};
