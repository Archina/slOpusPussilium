import { useRef, useState } from "react";
import { createDeckGift, parseDeckGift, type DeckGift } from "./deckGift";
import { QrImage, QrScanner } from "./QrShare";
import { acceptPairingOffer, applyPairingAnswer, closePeer, createOutgoingPeer, decodePairingSignal, encodePairingSignal, receiveChunkedJson, sendChunkedJson, waitForDataChannel } from "./webrtc";
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
  const scanResolver = useRef<((value: string) => void) | null>(null);
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
      setStatus("Have the recipient scan this offer, then scan their answer here.");
      await applyPairingAnswer(peer, await decodePairingSignal(await askScan("answer")));
      setQr(""); setStatus("Connecting directly…");
      const channel = await waitForDataChannel(peer.channel);
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
      setStatus("Show this answer to the sender, then keep this screen open.");
      const channel = await waitForDataChannel(await peer.channel);
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
    {qr && <div className="gift-pairing"><QrImage value={qr} label={step === "offer" ? "Deck Gift pairing offer" : "Deck Gift pairing answer"} /><p className="gift-copy">{status}</p></div>}
    {mode === "receive" && step === "idle" && !scanTarget && <div className="gift-copy"><p>Scan the sender’s offer QR. This creates a direct encrypted connection over the local network.</p><button className="primary" onClick={() => void startReceive()}>Scan sender’s QR</button></div>}
    {scanTarget && <QrScanner onResult={(value) => scanResolver.current?.(value)} onCancel={() => scanCancel.current?.()} />}
    {status && !qr && step !== "preview" && <p className="gift-copy" role="status">{status}</p>}
    {error && <p className="qr-error" role="alert">{error}</p>}
    {received && step === "preview" && <div className="gift-preview"><span className="gift-mark">✦</span><h3>{received.gift.content.name}</h3><p>{received.gift.content.description}</p><small>{received.gift.content.cards.length} cards · {received.gift.content.domain} · verified digest</small><div className="gift-preview-actions">{received.previous && <button className="text-button" onClick={() => void finish(true)}>Replace previous gift</button>}<button className="primary" onClick={() => void finish(false)}>Import as new copy</button></div></div>}
  </section></div>;
}
