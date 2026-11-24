import type { Deck, DomainSymbolId, StudyCard } from "../types";
import { sha256 } from "./events";

export type DeckGiftContent = {
  sourceDeckId: string;
  name: string;
  domain: string;
  symbol: DomainSymbolId;
  description: string;
  cards: StudyCard[];
};

export type DeckGift = {
  protocol: "opus-deck-gift";
  version: 1;
  transferId: string;
  createdAt: number;
  sourceDeviceId?: string;
  digest: string;
  content: DeckGiftContent;
};

const symbols = new Set<DomainSymbolId>(["language", "nordic", "life", "chemistry", "physics", "mathematics", "astronomy", "medicine", "computing", "engineering", "history", "philosophy", "arts"]);

export async function createDeckGift(deck: Deck, sourceDeviceId?: string): Promise<DeckGift> {
  const content: DeckGiftContent = {
    sourceDeckId: deck.id,
    name: deck.name,
    domain: deck.domain,
    symbol: deck.symbol,
    description: deck.description,
    cards: deck.questions.map((card) => ({ ...card })),
  };
  return { protocol: "opus-deck-gift", version: 1, transferId: crypto.randomUUID(), createdAt: Date.now(), sourceDeviceId, digest: await sha256(content), content };
}

export function serializeDeckGift(gift: DeckGift) {
  return JSON.stringify(gift);
}

function validateText(value: unknown, label: string, maximum: number) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) throw new Error(`Invalid ${label}`);
  return value;
}

export async function parseDeckGift(value: string): Promise<DeckGift> {
  let gift: DeckGift;
  try { gift = JSON.parse(value) as DeckGift; } catch { throw new Error("Deck Gift is not valid JSON"); }
  if (gift.protocol !== "opus-deck-gift" || gift.version !== 1 || typeof gift.createdAt !== "number") throw new Error("Unsupported Deck Gift format");
  validateText(gift.transferId, "transfer ID", 100);
  validateText(gift.digest, "digest", 128);
  validateText(gift.content?.sourceDeckId, "source deck ID", 200);
  validateText(gift.content?.name, "deck name", 120);
  validateText(gift.content?.domain, "deck domain", 120);
  if (!symbols.has(gift.content?.symbol)) throw new Error("Unknown deck symbol");
  if (typeof gift.content?.description !== "string" || gift.content.description.length > 4_000) throw new Error("Invalid deck description");
  if (!Array.isArray(gift.content?.cards) || gift.content.cards.length === 0 || gift.content.cards.length > 10_000) throw new Error("Invalid card collection");
  const ids = new Set<string>();
  for (const card of gift.content.cards) {
    validateText(card?.id, "card ID", 300);
    validateText(card?.prompt, "card prompt", 20_000);
    validateText(card?.answer, "card answer", 20_000);
    if (ids.has(card.id)) throw new Error("Deck Gift contains duplicate card IDs");
    ids.add(card.id);
  }
  if (await sha256(gift.content) !== gift.digest) throw new Error("Deck Gift digest does not match its content");
  return gift;
}

export function materializeGiftDeck(gift: DeckGift, previous?: Deck): Deck {
  const id = previous?.id ?? `gift-${crypto.randomUUID()}`;
  return {
    id,
    name: gift.content.name,
    domain: gift.content.domain,
    symbol: gift.content.symbol,
    description: gift.content.description,
    questions: gift.content.cards.map((card) => ({ ...card, id: `${id}:${card.id}` })),
    provenance: { sourceDeckId: gift.content.sourceDeckId, sourceDigest: gift.digest, importedAt: Date.now() },
  };
}
