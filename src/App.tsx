import { useRef, useState } from "react";

type StudyCard = { prompt: string; answer: string };
type Deck = { name: string; glyph: string; progress: number; hue: string; description: string; questions: StudyCard[] };

const decks: Deck[] = [
  { name: "Latin", glyph: "Ⅲ", progress: 72, hue: "gold", description: "First declension, common verbs, and sacred phrases.", questions: [
    { prompt: "What does per aspera ad astra mean?", answer: "Through hardships to the stars." },
    { prompt: "Translate: carpe diem.", answer: "Seize the day." },
    { prompt: "What is the Latin word for water?", answer: "Aqua." },
    { prompt: "What does memento mori mean?", answer: "Remember that you must die." },
    { prompt: "Translate: lux in tenebris.", answer: "Light in darkness." },
    { prompt: "What case commonly marks the direct object?", answer: "The accusative case." },
    { prompt: "What is the plural of rosa?", answer: "Rosae." },
    { prompt: "Translate: ars longa, vita brevis.", answer: "Art is long, life is short." },
    { prompt: "What does veritas mean?", answer: "Truth." },
    { prompt: "Translate: nosce te ipsum.", answer: "Know thyself." },
  ] },
  { name: "Biology", glyph: "✦", progress: 41, hue: "violet", description: "The architecture and rituals of the living cell.", questions: [
    { prompt: "Which structure holds a cell's genetic material?", answer: "The nucleus." },
    { prompt: "What molecule carries genetic instructions?", answer: "DNA." },
    { prompt: "Where does cellular respiration mainly occur?", answer: "In the mitochondria." },
    { prompt: "What boundary controls passage into a cell?", answer: "The cell membrane." },
    { prompt: "What organelle performs photosynthesis?", answer: "The chloroplast." },
    { prompt: "What is the basic unit of life?", answer: "The cell." },
    { prompt: "Which molecule is the cell's immediate energy currency?", answer: "ATP." },
    { prompt: "What do ribosomes produce?", answer: "Proteins." },
    { prompt: "What process divides one cell into two identical cells?", answer: "Mitosis." },
    { prompt: "What pigment absorbs light in plants?", answer: "Chlorophyll." },
  ] },
  { name: "Alchemy", glyph: "☽", progress: 18, hue: "rose", description: "Elements, symbols, and the history of transmutation.", questions: [
    { prompt: "What does the alchemical symbol ☽ represent?", answer: "Silver and the Moon." },
    { prompt: "What was the philosopher's stone believed to do?", answer: "Transmute base metals and grant an elixir of life." },
    { prompt: "Which metal is associated with the Sun?", answer: "Gold." },
    { prompt: "What does solve et coagula mean?", answer: "Dissolve and recombine." },
    { prompt: "What is the prima materia?", answer: "The formless first matter of the work." },
    { prompt: "Which element is represented by an upward triangle?", answer: "Fire." },
    { prompt: "What is calcination?", answer: "Purification through intense heat." },
    { prompt: "Which metal was traditionally linked to Saturn?", answer: "Lead." },
    { prompt: "What is an alembic used for?", answer: "Distillation." },
    { prompt: "What does the ouroboros symbolize?", answer: "Cycles, renewal, and unity." },
  ] },
];

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

function Sigil({ glyph, large = false }: { glyph: string; large?: boolean }) {
  return <div className={`sigil ${large ? "large" : ""}`}><i>{glyph}</i></div>;
}

function Home({ start }: { start: () => void }) {
  return <main className="home"><header><div className="brand"><Sigil glyph="☽" /><div><strong>OPUS PUSILLIUM</strong><small>Initiate · Level 7</small></div></div><button className="icon-button" aria-label="Settings">✦</button></header>
    <section className="hero"><div className="orb"><span>◉</span></div><p className="eyebrow">YOUR JOURNEY</p><h1>Knowledge remembers<br />those who persist.</h1></section>
    <section className="daily panel"><div><p className="eyebrow">DAILY SESSION</p><span>12 cards <em>~ 10 min</em></span></div><button className="primary" onClick={start}>Begin</button></section>
    <section className="reminder panel"><span className="spark">✦</span><div><p className="eyebrow">THE HOUR RETURNS</p><p>3 reviews await your attention.</p></div><button className="text-button">View</button></section>
    <section className="panel mastery"><div className="ring"><b>68%</b><small>Overall</small></div><div><p className="eyebrow">MASTERY PROGRESS</p><div className="constellation">✦ — ◇ — ✦<br />　　╲　╱<br />　　　✧</div></div></section>
  </main>;
}

function Decks({ open }: { open: (deck: Deck) => void }) {
  return <main className="screen"><header><button className="icon-button">←</button><div className="title"><p className="eyebrow">THE LIBRARY</p><h2>Your decks</h2></div><button className="icon-button">⋮</button></header>
    <div className="deck-list">{decks.map((deck) => <button className="deck-card" onClick={() => open(deck)} key={deck.name}><Sigil glyph={deck.glyph} /><div><h3>{deck.name}</h3><p>{deck.description}</p><div className="progress"><span style={{ width: `${deck.progress}%` }} /></div><small>{deck.progress}% mastered · {deck.questions.length} cards</small></div><b className="chevron">›</b></button>)}</div>
  </main>;
}

function Study({ deck, close }: { deck: Deck; close: () => void }) {
  const [queue, setQueue] = useState(() => deck.questions.map((_, index) => index));
  const [drawn, setDrawn] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [writing, setWriting] = useState(false);
  const [answerWritten, setAnswerWritten] = useState(false);
  const [answerFinished, setAnswerFinished] = useState(false);
  const [returning, setReturning] = useState<"deck" | "discard" | null>(null);
  const [dealNumber, setDealNumber] = useState(0);
  const [complete, setComplete] = useState(false);
  const writingTimer = useRef<number | undefined>(undefined);
  const soundTimer = useRef<number | undefined>(undefined);
  const revealedCards = useRef(new Set<number>());
  if (complete) return <main className="screen centered"><Sigil glyph="✦" large /><p className="eyebrow">DECK COMPLETE</p><h2>The pattern is remembered.</h2><p className="muted">Ten cards mastered · + 100 points</p><button className="primary wide" onClick={close}>Continue</button></main>;
  const currentCard = deck.questions[queue[0]];
  const completedCount = deck.questions.length - queue.length;
  const flipCard = () => {
    if (writingTimer.current) window.clearTimeout(writingTimer.current);
    if (soundTimer.current) window.clearTimeout(soundTimer.current);
    if (revealed) { setRevealed(false); setWriting(false); setAnswerWritten(true); setAnswerFinished(false); return; }
    setRevealed(true);
    if (revealedCards.current.has(queue[0])) {
      setWriting(false);
      setAnswerWritten(true);
      setAnswerFinished(true);
      return;
    }
    revealedCards.current.add(queue[0]);
    setWriting(true);
    setAnswerWritten(false);
    setAnswerFinished(false);
    soundTimer.current = window.setTimeout(playChalkSound, 1150);
    writingTimer.current = window.setTimeout(() => { setAnswerWritten(true); setAnswerFinished(true); }, 2350);
  };
  const gradeCard = (rating: "again" | "hard" | "easy") => {
    if (writingTimer.current) window.clearTimeout(writingTimer.current);
    if (soundTimer.current) window.clearTimeout(soundTimer.current);
    setAnswerFinished(false);
    setReturning(rating === "easy" ? "discard" : "deck");
    window.setTimeout(() => {
      if (rating === "hard") setQueue(([first, ...rest]) => [...rest, first]);
      if (rating === "easy") {
        if (queue.length === 1) { setComplete(true); return; }
        setQueue((cards) => cards.slice(1));
      }
      setReturning(null); setRevealed(false); setWriting(false); setAnswerWritten(false); setDealNumber((number) => number + 1);
    }, 760);
  };
  return <main className="screen study"><header><button className="icon-button" onClick={close}>×</button><div className="study-progress"><span style={{ width: `${completedCount / deck.questions.length * 100}%` }} /></div><small>{completedCount} / {deck.questions.length}</small></header>
    {!drawn ? <section className="draw-stage"><p className="eyebrow">THE DECK AWAITS</p><div className="deck-stack" aria-hidden="true"><div /><div /><div className="deck-back"><Sigil glyph={deck.glyph} /><span className="stack-count">{queue.length}</span></div></div><p className="muted">{queue.length} cards remain in this session.</p><button className="primary" onClick={() => setDrawn(true)}>Draw a card</button></section> : <>
      <section className="card-area"><button key={dealNumber} className={`card-scene ${revealed ? "is-flipped" : ""} ${returning ? `is-returning is-${returning}` : ""}`} onClick={flipCard} aria-label="Flip study card" aria-pressed={revealed} disabled={Boolean(returning)}><div className="physical-card"><div className="card-face card-front"><span className="corner-mark">✦</span><Sigil glyph={deck.glyph} /><p className="eyebrow">ARCANE {deck.name.toUpperCase()}</p><h2>{currentCard.prompt}</h2><small>Tap the card to turn it over</small></div><div className="card-face card-back"><span className="corner-mark">✦</span><Sigil glyph={deck.glyph} /><div className={`answer-ink ${writing ? "is-writing" : answerWritten ? "is-written" : ""}`} aria-live="polite"><p className="eyebrow">THE ANSWER</p><p className="answer">{currentCard.answer}</p><small>Tap to return to the question</small></div></div></div></button></section>
      {answerFinished && <section className="grading"><p>How well did you know this?</p><button onClick={() => gradeCard("again")}>Again</button><button onClick={() => gradeCard("hard")}>Hard</button><button className="primary" onClick={() => gradeCard("easy")}>Easy ✓</button></section>}
    </>}</main>;
}

function Quests() { return <main className="screen"><header><div className="title"><p className="eyebrow">THE PATH</p><h2>Quests</h2></div></header><div className="quest-path">{[["✦", "Apprentice", "Collect 100 points", true], ["Ⅱ", "Adept", "310 / 500 points", true], ["♜", "Magus", "Collect 1000 points", false], ["✧", "Master", "Collect 2000 points", false]].map(([glyph, title, detail, done]) => <div className={`quest ${done ? "done" : "locked"}`} key={String(title)}><Sigil glyph={String(glyph)} /><div><h3>{title}</h3><p>{detail}</p></div></div>)}</div></main>; }

function Profile() { const [times, setTimes] = useState(2); return <main className="screen profile"><header><button className="icon-button">⚙</button></header><Sigil glyph="☾" large /><h2>Initiate</h2><p>Level 7</p><div className="progress"><span style={{ width: "62%" }} /></div><small>310 / 500 XP</small><section className="stats">{[["✦", "1,230", "Total Points"], ["▣", "87", "Cards Mastered"], ["♨", "21", "Day Streak"], ["⌛", "4h 36m", "Study Time"]].map(([icon, value, label]) => <div key={label}><b>{icon} {value}</b><small>{label}</small></div>)}</section><section className="panel reminder-settings"><p className="eyebrow">REMINDER RITUAL</p><h3>Return for repetition</h3><p className="muted">In-app reminders are active. Scheduled push can be connected in a future release.</p><div className="stepper"><button onClick={() => setTimes(Math.max(1, times - 1))}>−</button><b>{times} times daily</b><button onClick={() => setTimes(times + 1)}>+</button></div></section></main>; }

export default function App() {
  const [page, setPage] = useState("home"); const [deck, setDeck] = useState<Deck | null>(null);
  const body = deck ? <Study deck={deck} close={() => { setDeck(null); setPage("decks"); }} /> : page === "home" ? <Home start={() => setDeck(decks[0])} /> : page === "decks" ? <Decks open={setDeck} /> : page === "quests" ? <Quests /> : <Profile />;
  return <div className="app-shell">{body}{!deck && <Nav page={page} setPage={setPage} />}</div>;
}
