import { useRef, useState } from "react";
import { createDeckGift, parseDeckGift, type DeckGift } from "./deckGift";
import { PairingQr, QrScanner } from "./QrShare";
import { acceptPairingOffer, applyPairingAnswer, closePeer, createOutgoingPeer, decodePairingSignal, encodePairingSignal, receiveChunkedJson, sendChunkedJson, sendControl, waitForControl, waitForDataChannel } from "./webrtc";
import type { Deck } from "../types";

type Step = "idle" | "offer" | "answer" | "transferring" | "preview" | "error";

export function DeckGiftDialog({ deck, customDecks, onImport, onClose }: { deck?: Deck; customDecks: Deck[]; onImport: (gift: DeckGift, previous?: Deck) => Promise<void>; onClose: () => void }) {
  const [mode] = useState<"send" | "receive">(deck ? "send" : "receive");
  const [step, setStep] = useState<Step>("idle");
  const [qr, setQr] = useState("");
  const [scanTarget, setScanTarget] = useState<"offer" | "answer" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [received, setReceived] = useState<{ gift: DeckGift; previous?: Deck } | null>(null);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const scanResolver = useRef<((value: string) => void) | null>(null);
  const answerReady = useRef<(() => void) | null>(null);
  const scanCancel = useRef<(() => void) | null>(null);

  const fail = (reason: unknown) => { setScanTarget(null); setError(reason instanceof Error ? reason.message : "LAN transfer failed"); setStep("error"); };
  const askScan = (target: "offer" | "answer") => new Promise<string>((resolve, reject) => {
    scanResolver.current = (value) => { scanResolver.current = null; setScanTarget(null); resolve(value); };
    scanCancel.current = () => { scanResolver.current = null; setScanTarget(null); reject(new Error("Pairing cancelled")); };
    setScanTarget(target);
  });

  const startSend = async () => {
    if (!deck) return;
    setError(""); setStatus("Preparing a local pairing offer…");
    try {
      const peer = await createOutgoingPeer();
      setQr(await encodePairingSignal(peer.offer));
      setStep("offer");
      setStatus("Step 1 of 2 — have the recipient scan this offer.");
      await new Promise<void>((resolve) => { answerReady.current = resolve; setAwaitingAnswer(true); });
      await applyPairingAnswer(peer, await decodePairingSignal(await askScan("answer")));
      setQr(""); setStatus("Connecting directly…");
      const channel = await waitForDataChannel(peer.channel, 45_000, peer.connection);
      const peerReady = waitForControl(channel, "ready");
      await sendControl(channel, "ready");
      await peerReady;
      setStatus("Sending deck content…");
      await sendChunkedJson(channel, JSON.stringify(await createDeckGift(deck)));
      closePeer(peer.connection);
      setStep("preview"); setStatus(`Sent ${deck.name} · ${deck.questions.length} cards`);
    } catch (reason) { fail(reason); }
  };

  const startReceive = async () => {
    setError(""); setStatus("Scanning the sender’s pairing offer…");
    try {
      const peer = await acceptPairingOffer(await decodePairingSignal(await askScan("offer")));
      setQr(await encodePairingSignal(peer.answer));
      setStep("answer");
      setStatus("Step 2 of 2 — show this answer to the sender.");
      const channel = await waitForDataChannel(await peer.channel, 45_000, peer.connection);
      const peerReady = waitForControl(channel, "ready");
      await sendControl(channel, "ready");
      await peerReady;
      setQr(""); setStep("transferring"); setStatus("Receiving deck content…");
      const gift = await parseDeckGift(await receiveChunkedJson<string>(channel));
      const previous = customDecks.find((candidate) => candidate.provenance?.sourceDeckId === gift.content.sourceDeckId);
      setReceived({ gift, previous }); setStep("preview");
      setStatus(`Received ${gift.content.name} · ${gift.content.cards.length} cards`);
      closePeer(peer.connection);
    } catch (reason) { fail(reason); }
  };

  const finish = async (replace: boolean) => {
    if (!received) return;
    try { await onImport(received.gift, replace ? received.previous : undefined); onClose(); }
    catch (reason) { fail(reason); }
  };

  return <div className="editor-overlay" role="presentation"><section className="deck-editor gift-dialog" role="dialog" aria-modal="true" aria-label="Share deck over local network"><header><div><p className="eyebrow">LAN DECK GIFT</p><h2>{mode === "send" ? `Share ${deck?.name ?? "deck"}` : "Receive a deck"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close deck sharing">×</button></header>
    {mode === "send" && step === "idle" && <div className="gift-copy"><p>Send this deck’s current content. Progress, scheduling, XP, and review history stay on this device.</p><button className="primary" onClick={() => void startSend()}>Create pairing QR</button></div>}
    {qr && <div className="gift-pairing"><PairingQr value={qr} label={step === "offer" ? "Deck Gift pairing offer" : "Deck Gift pairing answer"} /><p className="gift-copy">{status}</p>{awaitingAnswer && <button className="primary" onClick={() => { setAwaitingAnswer(false); answerReady.current?.(); answerReady.current = null; }}>Step 2 of 2 — Scan their answer</button>}</div>}
    {mode === "receive" && step === "idle" && !scanTarget && <div className="gift-copy"><p>Scan the sender’s offer QR. This creates a direct encrypted connection over the local network.</p><button className="primary" onClick={() => void startReceive()}>Scan sender’s QR</button></div>}
    {scanTarget && <QrScanner onResult={(value) => scanResolver.current?.(value)} onCancel={() => scanCancel.current?.()} />}
    {status && !qr && step !== "preview" && <p className="gift-copy" role="status">{status}</p>}
    {error && <div className="gift-copy"><p className="qr-error" role="alert">{error}</p><button className="text-button" onClick={() => { setError(""); setStep("idle"); setQr(""); }}>Try again</button></div>}
    {received && step === "preview" && <div className="gift-preview"><span className="gift-mark">✦</span><h3>{received.gift.content.name}</h3><p>{received.gift.content.description}</p><small>{received.gift.content.cards.length} cards · {received.gift.content.domain} · verified digest</small><div className="gift-preview-actions">{received.previous && <button className="text-button" onClick={() => void finish(true)}>Replace previous gift</button>}<button className="primary" onClick={() => void finish(false)}>Import as new copy</button></div></div>}
  </section></div>;
}
