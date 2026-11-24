import { useRef, useState } from "react";
import { QrImage, QrScanner } from "./QrShare";
import { appendLocalEvent, getBootstrapExperience, getDeviceIdentity, listSyncEvents, mergeRemoteEvents } from "./database";
import { acceptPairingOffer, applyPairingAnswer, closePeer, createOutgoingPeer, decodePairingSignal, encodePairingSignal, receiveChunkedJson, sendChunkedJson, sendControl, waitForControl, waitForDataChannel, type IncomingPeer, type OutgoingPeer } from "./webrtc";
import { bundleFromState, decryptBundle, derivePairKey, encryptBundle, makeVerifier, mergeTrustedBundles, type TrustedBundle, type TrustedDeviceRecord } from "./trusted";
import { listTrustedDevices, saveTrustedDevice } from "./trustedDevices";
import type { LearnerState } from "../types";

type Step = "choose" | "passphrase" | "offer" | "answer" | "syncing" | "complete" | "error";
type Direction = "pair" | "join" | "sync";

export function TrustedSyncDialog({ state, onMerged, onClose }: { state: LearnerState; onMerged: (state: LearnerState) => void; onClose: () => void }) {
  const [step, setStep] = useState<Step>("choose");
  const [direction, setDirection] = useState<Direction>("pair");
  const [passphrase, setPassphrase] = useState("");
  const [qr, setQr] = useState("");
  const [scanTarget, setScanTarget] = useState<"offer" | "answer" | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [peer, setPeer] = useState<TrustedDeviceRecord | null>(null);
  const [expectedPeer, setExpectedPeer] = useState<TrustedDeviceRecord | null>(null);
  const [awaitingAnswer, setAwaitingAnswer] = useState(false);
  const scanResolver = useRef<((value: string) => void) | null>(null);
  const scanCancel = useRef<(() => void) | null>(null);
  const answerReady = useRef<(() => void) | null>(null);

  const fail = (reason: unknown) => { setScanTarget(null); setError(reason instanceof Error ? reason.message : "Trusted sync failed"); setStep("error"); };
  const askScan = (target: "offer" | "answer") => new Promise<string>((resolve, reject) => {
    scanResolver.current = (value) => { scanResolver.current = null; setScanTarget(null); resolve(value); };
    scanCancel.current = () => { scanResolver.current = null; setScanTarget(null); reject(new Error("Pairing cancelled")); };
    setScanTarget(target);
  });

  const begin = (nextDirection: Direction, selectedPeer: TrustedDeviceRecord | null = null) => { setExpectedPeer(selectedPeer); setDirection(nextDirection); setError(""); setStep("passphrase"); };

  const exchange = async (initiator: boolean) => {
    if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters");
    if (expectedPeer) {
      const check = await makeVerifier(passphrase, expectedPeer.salt);
      if (check.verifier !== expectedPeer.verifier) throw new Error("That passphrase does not unlock the selected trusted device");
    }
    setStep("syncing"); setStatus("Preparing local event history…");
    const identity = await getDeviceIdentity();
    if (!identity) throw new Error("Device identity is not ready; reopen the app and try again");
    const events = await listSyncEvents();
    const localBundle = bundleFromState(state, events, identity.deviceId, "This device", await getBootstrapExperience());
    let connection: OutgoingPeer | IncomingPeer;
    let sessionId: string;
    if (initiator) {
      const outgoing = await createOutgoingPeer();
      connection = outgoing; sessionId = outgoing.sessionId;
      setQr(await encodePairingSignal(outgoing.offer)); setStep("offer"); setStatus("Let the other device scan this offer. Then continue to scan their answer.");
      await new Promise<void>((resolve) => { answerReady.current = resolve; setAwaitingAnswer(true); });
      await applyPairingAnswer(outgoing, await decodePairingSignal(await askScan("answer")));
    } else {
      const offerText = await askScan("offer");
      const incoming = await acceptPairingOffer(await decodePairingSignal(offerText));
      connection = incoming; sessionId = incoming.sessionId;
      setQr(await encodePairingSignal(incoming.answer)); setStep("answer"); setStatus("Show this answer to the other device.");
    }
    const channel = await waitForDataChannel(initiator ? (connection as OutgoingPeer).channel : await (connection as IncomingPeer).channel);
    setQr(""); setStatus("Authenticating and exchanging event history…");
    const verifier = await makeVerifier(passphrase);
    const key = await derivePairKey(passphrase, sessionId);
    setFingerprint(verifier.fingerprint);
    const peerReady = waitForControl(channel, "ready");
    const receive = receiveChunkedJson<string>(channel, 45_000);
    await sendControl(channel, "ready");
    await peerReady;
    const packet = await encryptBundle(localBundle, key, identity.deviceId, direction === "join" ? "Paired device" : "This device", verifier.fingerprint);
    await sendChunkedJson(channel, packet);
    const encrypted = await receive;
    const { bundle: remoteBundle, sender } = await decryptBundle(encrypted, key);
    if (expectedPeer && sender.deviceId !== expectedPeer.deviceId) throw new Error("A different device answered this trusted-sync request");
    await mergeRemoteEvents(remoteBundle.events);
    const localEvents = await listSyncEvents();
    const merged = mergeTrustedBundles({ ...localBundle, events: localEvents }, remoteBundle, state);
    await appendLocalEvent({ kind: "device", id: sender.deviceId }, "device.trusted", { deviceId: sender.deviceId, fingerprint: sender.fingerprint });
    saveTrustedDevice({ deviceId: sender.deviceId, name: sender.name, fingerprint: sender.fingerprint, salt: verifier.salt, verifier: verifier.verifier, pairedAt: Date.now(), lastSyncedAt: Date.now() });
    onMerged(merged.state);
    closePeer(connection.connection);
    setPeer({ deviceId: sender.deviceId, name: sender.name, fingerprint: sender.fingerprint, salt: verifier.salt, verifier: verifier.verifier, pairedAt: Date.now(), lastSyncedAt: Date.now() });
    setStatus(`Merged ${localEvents.length} events · ${merged.state.experience} total XP`);
    setStep("complete");
  };

  const start = () => { void exchange(direction !== "join").catch(fail); };
  const devices = listTrustedDevices();

  return <div className="editor-overlay" role="presentation"><section className="deck-editor gift-dialog" role="dialog" aria-modal="true" aria-label="Trusted device sync"><header><div><p className="eyebrow">TRUSTED DEVICE SYNC</p><h2>{direction === "sync" ? "Sync trusted device" : "Pair trusted device"}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close trusted sync">×</button></header>
    {step === "choose" && <div className="gift-copy"><p>Sync decks and learning progress directly with another device. The pairing is protected by a passphrase you both enter.</p><div className="trusted-choice"><button className="primary" onClick={() => begin("pair")}>Start pairing</button><button className="text-button" onClick={() => begin("join")}>Join pairing</button></div>{devices.length > 0 && <div className="trusted-list"><p className="eyebrow">PAIRED DEVICES</p>{devices.map((device) => <div key={device.deviceId}><span>{device.name}<small>{device.fingerprint} · last sync {device.lastSyncedAt ? new Date(device.lastSyncedAt).toLocaleString() : "never"}</small></span><button className="text-button" onClick={() => begin("sync", device)}>Sync</button></div>)}</div>}</div>}
    {step === "passphrase" && <div className="gift-copy"><label className="pairing-code">Sync passphrase<input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} minLength={8} autoComplete="new-password" placeholder="At least 8 characters" /></label><p>Both devices must enter the same passphrase. It is used to encrypt the transfer and is never sent to the other device.</p><div className="qr-actions"><button className="text-button" onClick={() => setStep("choose")}>Back</button><button className="primary" disabled={passphrase.length < 8} onClick={start}>{direction === "join" ? "Scan offer" : "Create offer"}</button></div></div>}
    {qr && <div className="gift-pairing"><QrImage value={qr} label="Trusted sync pairing QR" /><p className="gift-copy">{status}</p>{awaitingAnswer && <button className="primary" onClick={() => { setAwaitingAnswer(false); answerReady.current?.(); answerReady.current = null; }}>Scan other device’s answer</button>}</div>}
    {scanTarget && <QrScanner onResult={(value) => scanResolver.current?.(value)} onCancel={() => scanCancel.current?.()} />}
    {(step === "syncing" || status) && !qr && step !== "complete" && <p className="gift-copy" role="status">{status}</p>}
    {error && <div className="gift-copy"><p className="qr-error" role="alert">{error}</p><button className="text-button" onClick={() => { setError(""); setStep("choose"); }}>Try again</button></div>}
    {step === "complete" && peer && <div className="gift-preview"><span className="gift-mark">✓</span><h3>Devices synchronized</h3><p>{status}</p><small>Fingerprint {peer.fingerprint} · keep this passphrase for later syncs</small></div>}
  </section></div>;
}

export type { TrustedBundle };
