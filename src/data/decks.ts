import imported from "./imported-cards.json";
import type { Deck, StudyCard } from "../types";

const cards = (deckId: string, pairs: Array<[string, string]>): StudyCard[] =>
  pairs.map(([prompt, answer], index) => ({ id: `${deckId}-${index + 1}`, prompt, answer }));

export const decks: Deck[] = [
  { id: "latin", name: "Latin", domain: "Language", symbol: "language", description: "First declension, common verbs, and sacred phrases.", questions: cards("latin", [
    ["What does per aspera ad astra mean?", "Through hardships to the stars."], ["Translate: carpe diem.", "Seize the day."], ["What is the Latin word for water?", "Aqua."], ["What does memento mori mean?", "Remember that you must die."], ["Translate: lux in tenebris.", "Light in darkness."], ["What case commonly marks the direct object?", "The accusative case."], ["What is the plural of rosa?", "Rosae."], ["Translate: ars longa, vita brevis.", "Art is long, life is short."], ["What does veritas mean?", "Truth."], ["Translate: nosce te ipsum.", "Know thyself."],
  ]) },
  { id: "biology", name: "Biology", domain: "Life science", symbol: "life", description: "The architecture and rituals of the living cell.", questions: cards("biology", [
    ["Which structure holds a cell's genetic material?", "The nucleus."], ["What molecule carries genetic instructions?", "DNA."], ["Where does cellular respiration mainly occur?", "In the mitochondria."], ["What boundary controls passage into a cell?", "The cell membrane."], ["What organelle performs photosynthesis?", "The chloroplast."], ["What is the basic unit of life?", "The cell."], ["Which molecule is the cell's immediate energy currency?", "ATP."], ["What do ribosomes produce?", "Proteins."], ["What process divides one cell into two identical cells?", "Mitosis."], ["What pigment absorbs light in plants?", "Chlorophyll."],
  ]) },
  { id: "alchemy", name: "Alchemy", domain: "Chemistry", symbol: "chemistry", description: "Elements, symbols, and the history of transmutation.", questions: cards("alchemy", [
    ["What does the alchemical symbol ☽ represent?", "Silver and the Moon."], ["What was the philosopher's stone believed to do?", "Transmute base metals and grant an elixir of life."], ["Which metal is associated with the Sun?", "Gold."], ["What does solve et coagula mean?", "Dissolve and recombine."], ["What is the prima materia?", "The formless first matter of the work."], ["Which element is represented by an upward triangle?", "Fire."], ["What is calcination?", "Purification through intense heat."], ["Which metal was traditionally linked to Saturn?", "Lead."], ["What is an alembic used for?", "Distillation."], ["What does the ouroboros symbolize?", "Cycles, renewal, and unity."],
  ]) },
  { id: "tamil", name: "Tamil", domain: "Language", symbol: "language", description: "Vowels, written forms, and foundational vocabulary.", questions: imported.tamil },
  { id: "norwegian", name: "Norwegian", domain: "Nordic languages", symbol: "nordic", description: "A broad two-way Norwegian and English vocabulary collection.", questions: imported.norwegian },
];
