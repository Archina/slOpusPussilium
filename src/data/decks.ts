import imported from "./imported-cards.json";
import { mycologyCards } from "./mycology";
import type { Deck, StudyCard } from "../types";

const cards = (deckId: string, pairs: Array<[string, string]>): StudyCard[] =>
  pairs.map(([prompt, answer], index) => ({ id: `${deckId}-${index + 1}`, prompt, answer }));

export const decks: Deck[] = [
  { id: "latin", name: "Latin", domain: "Language", symbol: "language", description: "First declension, common verbs, and sacred phrases.", questions: cards("latin", [
    ["What does per aspera ad astra mean?", "Through hardships to the stars."], ["Translate: carpe diem.", "Seize the day."], ["What is the Latin word for water?", "Aqua."], ["What does memento mori mean?", "Remember that you must die."], ["Translate: lux in tenebris.", "Light in darkness."], ["What case commonly marks the direct object?", "The accusative case."], ["What is the plural of rosa?", "Rosae."], ["Translate: ars longa, vita brevis.", "Art is long, life is short."], ["What does veritas mean?", "Truth."], ["Translate: nosce te ipsum.", "Know thyself."],
  ]) },
  { id: "mycology", name: "Mycology", domain: "Fungal biology", symbol: "life", description: "Fungal diversity, structures, life cycles, ecology, lichens, and fungus-like organisms.", questions: mycologyCards },
  { id: "alchemy", name: "Alchemy", domain: "Chemistry", symbol: "chemistry", description: "Elements, symbols, and the history of transmutation.", questions: cards("alchemy", [
    ["What does the alchemical symbol ☽ represent?", "Silver and the Moon."], ["What was the philosopher's stone believed to do?", "Transmute base metals and grant an elixir of life."], ["Which metal is associated with the Sun?", "Gold."], ["What does solve et coagula mean?", "Dissolve and recombine."], ["What is the prima materia?", "The formless first matter of the work."], ["Which element is represented by an upward triangle?", "Fire."], ["What is calcination?", "Purification through intense heat."], ["Which metal was traditionally linked to Saturn?", "Lead."], ["What is an alembic used for?", "Distillation."], ["What does the ouroboros symbolize?", "Cycles, renewal, and unity."],
  ]) },
  { id: "tamil", name: "Tamil", domain: "Language", symbol: "language", description: "Vowels, written forms, and foundational vocabulary.", questions: imported.tamil },
  { id: "norwegian", name: "Norwegian", domain: "Nordic languages", symbol: "nordic", description: "A broad two-way Norwegian and English vocabulary collection.", questions: imported.norwegian },
];
