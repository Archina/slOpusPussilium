import { lazy, Suspense, useRef, useState } from "react";
import { decks } from "./data/decks";
import { Sigil, symbolCatalog } from "./Sigil";
import { buildSession, cardKey, dueCount, experienceForReview, mastery, MOMENTUM_COST, rankForFailures, reviewCard } from "./scheduler";
import { todayKey, useLearnerState } from "./storage";
import type { Deck, DeckEdit, DifficultyMode, LearnerState, LibrarySort, Rating, SessionCard, StudyCard } from "./types";

const DeckBox3D = lazy(() => import("./DeckBox3D").then((module) => ({ default: module.DeckBox3D })));

function playChalkSound() {
  type AudioWindow = Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const Context = window.AudioContext || (window as AudioWindow).webkitAudioContext;
  if (!Context) return;
  try {
    const context = new Context();
    const noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = noise;
    filter.type = "bandpass";
    filter.frequency.value = 2100;
    filter.Q.value = 0.6;
    gain.gain.setValueAtTime(0.001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.022, context.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.85);
    source.connect(filter).connect(gain).connect(context.destination);
    source.start();
    source.stop(context.currentTime + 1.9);
    source.addEventListener("ended", () => void context.close());
  } catch { /* Sound is decorative; study remains usable when audio is unavailable. */ }
}

function Nav({ page, setPage }: { page: string; setPage: (page: string) => void }) {
  return <nav className="nav">{[["home", "⌂", "Home"], ["decks", "▣", "Decks"], ["quests", "✧", "Quests"], ["profile", "♙", "Profile"]].map(([id, icon, label]) =>
    <button className={page === id ? "active" : ""} onClick={() => setPage(id)} key={id}><b>{icon}</b><span>{label}</span></button>)}</nav>;
}

function deckSettings(state: LearnerState, deck: Deck) {
  const stored = state.decks[deck.id];
  const active = stored?.active ?? deck.id === "latin";
  return { active, sessionsCompleted: stored?.sessionDate === todayKey() ? stored.sessionsCompleted : 0 };
}

const maximumHealth = (mode: DifficultyMode) => mode === "scholar" ? 5 : mode === "adept" ? 3 : null;

function Home({ state, deckList, start }: { state: LearnerState; deckList: Deck[]; start: () => void }) {
  const activeDecks = deckList.filter((deck) => deckSettings(state, deck).active);
  const sessionsDone = activeDecks.reduce((sum, deck) => sum + deckSettings(state, deck).sessionsCompleted, 0);
  const sessionsTarget = Math.max(2, activeDecks.length * 2);
  return <main className="home"><header><div className="brand"><Sigil symbol="astronomy" /><div><strong>OPUS PUSILLIUM</strong><small>{state.experience} XP · {state.streak} day streak</small></div></div><button className="icon-button" aria-label="Settings">✦</button></header>
    <section className="hero"><div className="orb"><span>◉</span></div><p className="eyebrow">YOUR JOURNEY</p><h1>Knowledge remembers<br />those who persist.</h1></section>
    <section className="daily panel"><div><p className="eyebrow">DAILY PRACTICE</p><span>10 cards <em>~ 10 min</em></span><small>{sessionsDone} / {sessionsTarget} sessions complete</small></div><button className="primary" onClick={start} disabled={activeDecks.length === 0}>Begin</button></section>
    <section className="reminder panel"><span className="spark">✦</span><div><p className="eyebrow">THE HOUR RETURNS</p><p>{activeDecks.reduce((sum, deck) => sum + dueCount(deck, state), 0)} cards ready across active decks.</p></div><button className="text-button">View</button></section>
    <section className="panel mastery"><div className="ring"><b>{activeDecks.length || 1}</b><small>Active</small></div><div><p className="eyebrow">LEARNING PATH</p><div className="constellation">✦ — ◇ — ✦<br />　　╲　╱<br />　　　✧</div></div></section>
  </main>;
}

function DeckEditor({ deck, save, close }: { deck: Deck; save: (edit: DeckEdit) => void; close: () => void }) {
  const [draft, setDraft] = useState<DeckEdit>({ name: deck.name, domain: deck.domain, symbol: deck.symbol, description: deck.description, questions: deck.questions.map((card) => ({ ...card })) });
  const [query, setQuery] = useState("");
  const visibleCards = (draft.questions ?? []).filter((card) => `${card.prompt} ${card.answer}`.toLowerCase().includes(query.toLowerCase())).slice(0, 50);
  const updateCard = (id: string, field: "prompt" | "answer", value: string) => setDraft((current) => ({ ...current, questions: (current.questions ?? []).map((card) => card.id === id ? { ...card, [field]: value } : card) }));
  const removeCard = (id: string) => setDraft((current) => ({ ...current, questions: (current.questions ?? []).filter((card) => card.id !== id) }));
  const addCard = () => setDraft((current) => ({ ...current, questions: [{ id: `custom-${crypto.randomUUID()}`, prompt: "New question", answer: "New answer" }, ...(current.questions ?? [])] }));
  return <div className="editor-overlay" role="presentation"><section className="deck-editor" role="dialog" aria-modal="true" aria-label={`Edit ${deck.name} deck`}><header><div><p className="eyebrow">DECK WORKSHOP</p><h2>Edit deck</h2></div><button className="icon-button" onClick={close} aria-label="Close editor">×</button></header>
    <div className="identity-fields"><label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label>Domain<input value={draft.domain} onChange={(event) => setDraft({ ...draft, domain: event.target.value })} /></label><label className="wide-field">Description<textarea rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label></div>
    <div><p className="eyebrow">DOMAIN SIGIL</p><div className="symbol-picker">{symbolCatalog.map((entry) => <button className={draft.symbol === entry.id ? "selected" : ""} onClick={() => setDraft({ ...draft, symbol: entry.id, domain: entry.name })} key={entry.id} title={entry.name}><Sigil symbol={entry.id} /><small>{entry.name}</small></button>)}</div></div>
    <div className="card-editor-heading"><div><p className="eyebrow">LEARNING CARDS</p><h3>{draft.questions?.length ?? 0} cards</h3></div><button className="text-button" onClick={addCard}>+ Add card</button></div>
    <input className="card-search" type="search" placeholder="Search prompts and answers" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="editable-cards">{visibleCards.map((card) => <article className="editable-card" key={card.id}><label>Front<textarea rows={2} value={card.prompt} onChange={(event) => updateCard(card.id, "prompt", event.target.value)} /></label><label>Back<textarea rows={2} value={card.answer} onChange={(event) => updateCard(card.id, "answer", event.target.value)} /></label><button className="remove-card" onClick={() => removeCard(card.id)} aria-label={`Remove ${card.prompt}`}>×</button></article>)}</div>
    {(draft.questions?.length ?? 0) > visibleCards.length && <p className="muted editor-limit">Showing the first 50 matches. Search to find another card.</p>}
    <footer><button className="text-button" onClick={close}>Cancel</button><button className="primary" onClick={() => save(draft)}>Save deck</button></footer>
  </section></div>;
}

function Decks({ state, deckList, open, saveEdit, toggleActive, setSort }: { state: LearnerState; deckList: Deck[]; open: (deck: Deck) => void; saveEdit: (deck: Deck, edit: DeckEdit) => void; toggleActive: (deck: Deck) => void; setSort: (sort: LibrarySort) => void }) {
  const [editing, setEditing] = useState<Deck | null>(null);
  const sortedDecks = [...deckList].sort((left, right) => {
    const activeOrder = Number(deckSettings(state, right).active) - Number(deckSettings(state, left).active);
    if (activeOrder) return activeOrder;
    const comparison = state.librarySort.field === "name" ? left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) : left.questions.length - right.questions.length || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
    return state.librarySort.direction === "asc" ? comparison : -comparison;
  });
  return <main className="screen"><header><button className="icon-button">←</button><div className="title"><p className="eyebrow">THE LIBRARY</p><h2>Your decks</h2></div><button className="icon-button">⋮</button></header>
    <div className="library-sort"><span>Active first</span><label>Sort by<select aria-label="Sort decks by" value={state.librarySort.field} onChange={(event) => setSort({ ...state.librarySort, field: event.target.value as LibrarySort["field"] })}><option value="name">Name</option><option value="size">Deck size</option></select></label><button onClick={() => setSort({ ...state.librarySort, direction: state.librarySort.direction === "asc" ? "desc" : "asc" })} aria-label="Reverse deck sorting">{state.librarySort.field === "name" ? state.librarySort.direction === "asc" ? "A → Z" : "Z → A" : state.librarySort.direction === "asc" ? "Small → Large" : "Large → Small"}</button></div>
    <div className="deck-list deck-box-grid">{sortedDecks.map((deck) => { const progress = mastery(deck, state); const settings = deckSettings(state, deck); return <article className={`deck-card deck-box-tile ${settings.active ? "is-active" : ""}`} aria-label={`${deck.name} deck`} key={deck.id}><Suspense fallback={<div className="deck-box-fallback"><Sigil symbol={deck.symbol} /></div>}><DeckBox3D deck={deck} onStudy={() => open(deck)} /></Suspense><div className="deck-actions"><button className="deck-active-button" onClick={() => toggleActive(deck)} aria-label={`${settings.active ? "Deactivate" : "Activate"} ${deck.name} deck`} aria-pressed={settings.active}>{settings.active ? "★" : "☆"}</button><button className="deck-edit-button" onClick={() => setEditing(deck)} aria-label={`Edit ${deck.name} deck`}>✎</button></div><div className="deck-progress-overlay"><div><small>{progress}% mastered · {dueCount(deck, state)} ready</small><div className="progress"><span style={{ width: `${progress}%` }} /></div>{settings.active && <span className="active-mark">Active · {settings.sessionsCompleted}/2 today</span>}</div></div></article>; })}</div>
    {editing && <DeckEditor deck={editing} close={() => setEditing(null)} save={(edit) => { saveEdit(editing, edit); setEditing(null); }} />}
  </main>;
}

function Study({ deck, sessionCards, bonusCards, difficulty, close, onReview, onSessionComplete }: { deck: Deck; sessionCards: SessionCard[]; bonusCards: SessionCard[]; difficulty: DifficultyMode; close: () => void; onReview: (card: SessionCard, rating: Rating, reducedXp: boolean) => void; onSessionComplete: () => void }) {
  const [cards, setCards] = useState(() => [...sessionCards, ...bonusCards]);
  const [queue, setQueue] = useState(() => sessionCards.map((_, index) => index));
  const [drawn, setDrawn] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [writing, setWriting] = useState(false);
  const [answerWritten, setAnswerWritten] = useState(false);
  const [answerFinished, setAnswerFinished] = useState(false);
  const [returning, setReturning] = useState<"deck" | "discard" | null>(null);
  const [dealNumber, setDealNumber] = useState(0);
  const [complete, setComplete] = useState(false);
  const [awaitingBonus, setAwaitingBonus] = useState(false);
  const [bonusIndex, setBonusIndex] = useState(0);
  const [bonusAdded, setBonusAdded] = useState(0);
  const [momentum, setMomentum] = useState(0);
  const [bonusDrawCount, setBonusDrawCount] = useState(2);
  const maxHealth = maximumHealth(difficulty);
  const [health, setHealth] = useState(maxHealth);
  const writingTimer = useRef<number | undefined>(undefined);
  const soundTimer = useRef<number | undefined>(undefined);
  const revealedCards = useRef(new Set<string>());
  const totalCards = sessionCards.length + bonusAdded;
  const completedCount = totalCards - queue.length;
  const finishSession = () => { onSessionComplete(); setComplete(true); setAwaitingBonus(false); };
  if (complete) return <main className="screen centered"><Sigil symbol={deck.symbol} large /><p className="eyebrow">SESSION COMPLETE</p><h2>The pattern is remembered.</h2><p className="muted">{totalCards} cards studied · progress and XP saved locally</p><button className="primary wide" onClick={close}>Continue</button></main>;
  if (awaitingBonus) {
    const maximumBonusCards = Math.min(Math.floor(momentum / MOMENTUM_COST), bonusCards.length - bonusIndex);
    const drawCount = Math.max(1, Math.min(bonusDrawCount, maximumBonusCards));
    const momentumCost = drawCount * MOMENTUM_COST;
    return <main className="screen centered bonus-offer"><Sigil symbol="astronomy" large /><p className="eyebrow">MOMENTUM GATHERED</p><h2>Your insight can carry you further.</h2><p className="muted">Choose a batch of bonus cards. Each card costs {MOMENTUM_COST} Momentum.</p><div className="momentum-orb">◆ {momentum}</div><label className="bonus-slider"><span>Bonus cards <strong>{drawCount}</strong></span><input aria-label="Bonus cards to draw" type="range" min="1" max={maximumBonusCards} value={drawCount} onChange={(event) => setBonusDrawCount(Number(event.target.value))} /><small>Cost: ◆ {momentumCost} · {maximumBonusCards} available</small></label><button className="primary wide" disabled={maximumBonusCards < 1} onClick={() => { const indices = Array.from({ length: drawCount }, (_, offset) => sessionCards.length + bonusIndex + offset); setMomentum((value) => value - momentumCost); setQueue(indices); setBonusIndex((value) => value + drawCount); setBonusAdded((value) => value + drawCount); setAwaitingBonus(false); setDrawn(true); setDealNumber((value) => value + 1); }}>Spend {momentumCost} · Draw {drawCount} bonus {drawCount === 1 ? "card" : "cards"}</button><button className="text-button" onClick={finishSession}>Finish session</button></main>;
  }
  const currentCard = cards[queue[0]];
  const rankMultiplier = [1, 1.5, 2, 3][currentCard.rank];
  const reward = (rating: Rating) => experienceForReview(rating, currentCard.rank);
  const flipCard = () => {
    if (writingTimer.current) window.clearTimeout(writingTimer.current);
    if (soundTimer.current) window.clearTimeout(soundTimer.current);
    if (revealed) { setRevealed(false); setWriting(false); setAnswerWritten(true); setAnswerFinished(false); return; }
    setRevealed(true);
    if (revealedCards.current.has(currentCard.id)) {
      setWriting(false);
      setAnswerWritten(true);
      setAnswerFinished(true);
      return;
    }
    revealedCards.current.add(currentCard.id);
    setWriting(true);
    setAnswerWritten(false);
    setAnswerFinished(false);
    soundTimer.current = window.setTimeout(playChalkSound, 1150);
    writingTimer.current = window.setTimeout(() => { setAnswerWritten(true); setAnswerFinished(true); }, 2350);
  };
  const gradeCard = (rating: Rating) => {
    if (writingTimer.current) window.clearTimeout(writingTimer.current);
    if (soundTimer.current) window.clearTimeout(soundTimer.current);
    setAnswerFinished(false);
    onReview(currentCard, rating, health !== null && health <= 0);
    if (rating === "again" && health !== null) setHealth(Math.max(0, health - 1));
    const nextMomentum = rating === "easy" ? momentum + 1 : momentum;
    if (rating === "easy") setMomentum(nextMomentum);
    if (rating === "again") setCards((current) => current.map((card, index) => index === queue[0] ? { ...card, failures: card.failures + 1, rank: rankForFailures(card.failures + 1) } : card));
    setReturning(rating === "good" || rating === "easy" ? "discard" : "deck");
    window.setTimeout(() => {
      if (rating === "again") setQueue(([first, ...rest]) => { const retryAt = Math.min(2, rest.length); return [...rest.slice(0, retryAt), first, ...rest.slice(retryAt)]; });
      if (rating === "hard") setQueue(([first, ...rest]) => [...rest, first]);
      if (rating === "good" || rating === "easy") {
        if (queue.length === 1) {
          if (nextMomentum >= MOMENTUM_COST && bonusIndex < bonusCards.length) setAwaitingBonus(true);
          else finishSession();
          setReturning(null);
          return;
        }
        setQueue((cards) => cards.slice(1));
      }
      setReturning(null); setRevealed(false); setWriting(false); setAnswerWritten(false); setDealNumber((number) => number + 1);
    }, 760);
  };
  return <main className="screen study"><header><button className="icon-button" onClick={close}>×</button><div className="study-progress"><span style={{ width: `${completedCount / totalCards * 100}%` }} /></div><small>{completedCount} / {totalCards}</small><span className="momentum" aria-label={`${momentum} momentum`}>◆ {momentum}</span>{health !== null && <span className="health" aria-label={`${health} hearts remaining`}>{Array.from({ length: maxHealth ?? 0 }, (_, index) => index < health ? "♥" : "♡").join("")}</span>}</header>
    {health === 0 && <div className="practice-banner">Practice mode · keep learning with reduced XP</div>}
    {!drawn ? <section className="draw-stage"><p className="eyebrow">THE DECK AWAITS</p><div className="deck-stack" aria-hidden="true"><div /><div /><div className="deck-back"><Sigil symbol={deck.symbol} /><span className="stack-count">{queue.length}</span></div></div><p className="muted">{queue.length} cards remain in this session.</p><button className="primary" onClick={() => setDrawn(true)}>Draw a card</button></section> : <>
      <section className="card-area"><button key={dealNumber} className={`card-scene status-${currentCard.status} rank-${currentCard.rank} ${revealed ? "is-flipped" : ""} ${returning ? `is-returning is-${returning}` : ""}`} onClick={flipCard} aria-label="Flip study card" aria-pressed={revealed} disabled={Boolean(returning)}><div className="physical-card"><div className="card-face card-front"><span className="corner-mark">✦</span><span className="card-status">{currentCard.status === "unseen" ? "Unseen" : currentCard.status === "due" ? "Due review" : "Scheduled"}{currentCard.rank > 0 ? ` · Rank ${currentCard.rank + 1}` : ""}</span><Sigil symbol={deck.symbol} /><p className="eyebrow">ARCANE {deck.name.toUpperCase()}</p><h2>{currentCard.prompt}</h2><small>Tap the card to turn it over</small></div><div className="card-face card-back"><span className="corner-mark">✦</span><span className="card-status">Worth ×{rankMultiplier} XP</span><Sigil symbol={deck.symbol} /><div className={`answer-ink ${writing ? "is-writing" : answerWritten ? "is-written" : ""}`} aria-live="polite"><p className="eyebrow">THE ANSWER</p><p className="answer">{currentCard.answer}</p><small>Tap to return to the question</small></div></div></div></button></section>
      {answerFinished && <section className="grading"><p>How well did you know this?</p><button aria-label="Again" onClick={() => gradeCard("again")}>Again <small>+{reward("again")} XP</small></button><button aria-label="Hard" onClick={() => gradeCard("hard")}>Hard <small>+{reward("hard")} XP</small></button><button aria-label="Good" onClick={() => gradeCard("good")}>Good <small>+{reward("good")} XP</small></button><button className="primary" aria-label="Easy ✓" onClick={() => gradeCard("easy")}>Easy ✓ <small>+{reward("easy")} XP · ◆</small></button></section>}
    </>}</main>;
}

function Quests({ experience }: { experience: number }) { return <main className="screen"><header><div className="title"><p className="eyebrow">THE PATH</p><h2>Quests</h2></div></header><div className="quest-path">{[["language", "Apprentice", 100], ["philosophy", "Adept", 500], ["astronomy", "Magus", 1000], ["arts", "Master", 2000]].map(([symbol, title, target]) => { const needed = Number(target); return <div className={`quest ${experience >= needed ? "done" : "locked"}`} key={String(title)}><Sigil symbol={symbol as Deck["symbol"]} /><div><h3>{title}</h3><p>{Math.min(experience, needed)} / {needed} XP</p></div></div>; })}</div></main>; }

function Profile({ state, deckList, setDifficulty, toggleDeck }: { state: LearnerState; deckList: Deck[]; setDifficulty: (mode: DifficultyMode) => void; toggleDeck: (deck: Deck) => void }) {
  const learned = Object.values(state.cards).filter((card) => card.successes > 0).length;
  const level = Math.floor(state.experience / 100) + 1;
  const levelProgress = state.experience % 100;
  return <main className="screen profile"><header><button className="icon-button">⚙</button></header><Sigil symbol="astronomy" large /><h2>Initiate · Level {level}</h2><p>{state.difficulty === "adventurer" ? "Adventurer" : state.difficulty === "scholar" ? "Scholar" : "Adept"}</p><div className="progress xp-meter"><span style={{ width: `${levelProgress}%` }} /></div><small>{levelProgress} / 100 XP to level {level + 1}</small><section className="stats">{[["✦", String(state.experience), "Total Experience"], ["▣", String(learned), "Cards Encountered"], ["♨", String(state.streak), "Day Streak"], ["⌛", "2 × 10m", "Daily Goal"]].map(([icon, value, label]) => <div key={label}><b>{icon} {value}</b><small>{label}</small></div>)}</section>
    <section className="panel settings-panel"><p className="eyebrow">CHALLENGE PATH</p><h3>Choose what helps you learn</h3><div className="mode-grid">{([ ["adventurer", "Adventurer", "No hearts · full freedom"], ["scholar", "Scholar", "5 hearts · soft practice"], ["adept", "Adept", "3 hearts · greater challenge"] ] as const).map(([id, name, detail]) => <button className={state.difficulty === id ? "selected" : ""} onClick={() => setDifficulty(id)} key={id}><b>{name}</b><small>{detail}</small></button>)}</div><p className="muted">At zero hearts you can always continue; only XP rewards are reduced.</p></section>
    <section className="panel settings-panel"><p className="eyebrow">ACTIVE DECKS</p><h3>Two short sessions per active deck</h3><div className="deck-toggles">{deckList.map((deck) => <label key={deck.id}><input type="checkbox" checked={deckSettings(state, deck).active} onChange={() => toggleDeck(deck)} /><span className="deck-toggle-name"><Sigil symbol={deck.symbol} />{deck.name}</span><small>{deck.questions.length} cards</small></label>)}</div></section>
    <section className="panel reminder-settings"><p className="eyebrow">REMINDER RITUAL</p><h3>Return for repetition</h3><p className="muted">Two ten-minute sessions are planned for each active deck. Progress and settings remain on this device.</p></section></main>;
}

export default function App() {
  const [page, setPage] = useState("home");
  const [state, setState] = useLearnerState();
  const deckList = decks.map((deck) => {
    const edit = state.deckEdits[deck.id];
    return edit ? { ...deck, ...edit, questions: edit.questions ?? deck.questions } : deck;
  });
  const [study, setStudy] = useState<{ deck: Deck; cards: SessionCard[]; bonusCards: SessionCard[] } | null>(null);
  const startDeck = (deck: Deck) => {
    const cards = buildSession(deck, state);
    const selectedIds = new Set(cards.map((card) => card.id));
    const bonusCards = buildSession(deck, state, deck.questions.length).filter((card) => !selectedIds.has(card.id));
    setStudy({ deck, cards, bonusCards });
  };
  const startNext = () => {
    const active = deckList.filter((deck) => deckSettings(state, deck).active);
    const next = active.find((deck) => deckSettings(state, deck).sessionsCompleted < 2) ?? active[0];
    if (next) startDeck(next);
  };
  const recordReview = (deck: Deck, card: SessionCard, rating: Rating, reducedXp: boolean) => setState((current) => {
    const key = cardKey(deck.id, card.id);
    const earned = experienceForReview(rating, card.rank, reducedXp);
    return { ...current, experience: current.experience + earned, cards: { ...current.cards, [key]: reviewCard(current.cards[key], rating) } };
  });
  const completeSession = (deck: Deck) => setState((current) => {
    const today = todayKey();
    const yesterday = todayKey(new Date(Date.now() - 86_400_000));
    const previous = current.decks[deck.id];
    const sessionsCompleted = previous?.sessionDate === today ? Math.min(2, previous.sessionsCompleted + 1) : 1;
    const streak = current.lastStudyDate === today ? current.streak : current.lastStudyDate === yesterday ? current.streak + 1 : 1;
    return { ...current, streak, lastStudyDate: today, decks: { ...current.decks, [deck.id]: { active: previous?.active ?? deck.id === "latin", sessionDate: today, sessionsCompleted } } };
  });
  const setDifficulty = (difficulty: DifficultyMode) => setState((current) => ({ ...current, difficulty }));
  const toggleDeck = (deck: Deck) => setState((current) => {
    const settings = deckSettings(current, deck);
    return { ...current, decks: { ...current.decks, [deck.id]: { active: !settings.active, sessionDate: todayKey(), sessionsCompleted: settings.sessionsCompleted } } };
  });
  const saveDeckEdit = (deck: Deck, edit: DeckEdit) => setState((current) => ({ ...current, deckEdits: { ...current.deckEdits, [deck.id]: edit } }));
  const setLibrarySort = (librarySort: LibrarySort) => setState((current) => ({ ...current, librarySort }));
  const body = study ? <Study deck={study.deck} sessionCards={study.cards} bonusCards={study.bonusCards} difficulty={state.difficulty} close={() => { setStudy(null); setPage("decks"); }} onReview={(card, rating, reduced) => recordReview(study.deck, card, rating, reduced)} onSessionComplete={() => completeSession(study.deck)} /> : page === "home" ? <Home state={state} deckList={deckList} start={startNext} /> : page === "decks" ? <Decks state={state} deckList={deckList} open={startDeck} saveEdit={saveDeckEdit} toggleActive={toggleDeck} setSort={setLibrarySort} /> : page === "quests" ? <Quests experience={state.experience} /> : <Profile state={state} deckList={deckList} setDifficulty={setDifficulty} toggleDeck={toggleDeck} />;
  return <div className="app-shell">{body}{!study && <Nav page={page} setPage={setPage} />}</div>;
}
