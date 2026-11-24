export type PairingSignal = {
  protocol: "opus-lan-pairing";
  version: 1;
  sessionId: string;
  description: RTCSessionDescriptionInit;
};

export type OutgoingPeer = {
  sessionId: string;
  connection: RTCPeerConnection;
  channel: RTCDataChannel;
  offer: PairingSignal;
};

export type IncomingPeer = {
  sessionId: string;
  connection: RTCPeerConnection;
  channel: Promise<RTCDataChannel>;
  answer: PairingSignal;
};

const CHANNEL = "opus-sync";
const CHUNK_SIZE = 12_000;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16_384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlToBytes(value: string) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function compress(bytes: Uint8Array) {
  if (!("CompressionStream" in globalThis)) return { encoding: "json" as const, bytes };
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("gzip"));
  return { encoding: "gzip" as const, bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
}

async function decompress(bytes: Uint8Array, encoding: string) {
  if (encoding === "json") return bytes;
  if (encoding !== "gzip" || !("DecompressionStream" in globalThis)) throw new Error("This browser cannot decode the pairing QR");
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodePairingSignal(signal: PairingSignal) {
  validatePairingSignal(signal);
  const packed = await compress(new TextEncoder().encode(JSON.stringify(signal)));
  return `opus-pairing:1:${packed.encoding}:${bytesToBase64Url(packed.bytes)}`;
}

export async function decodePairingSignal(value: string) {
  const [protocol, version, encoding, payload] = value.split(":");
  if (protocol !== "opus-pairing" || version !== "1" || !payload) throw new Error("Unsupported pairing QR");
  let signal: PairingSignal;
  try { signal = JSON.parse(new TextDecoder().decode(await decompress(base64UrlToBytes(payload), encoding))) as PairingSignal; }
  catch (error) { throw new Error("Pairing QR is corrupted", { cause: error }); }
  return validatePairingSignal(signal);
}

function waitForIceGathering(connection: RTCPeerConnection, timeout = 10_000) {
  if (connection.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error("Timed out gathering local-network connection candidates")), timeout);
    const finish = (error?: Error) => {
      window.clearTimeout(timer);
      connection.removeEventListener("icegatheringstatechange", stateListener);
      connection.removeEventListener("icecandidate", candidateListener);
      if (error) reject(error); else resolve();
    };
    const stateListener = () => {
      if (connection.iceGatheringState === "complete") {
        finish();
      }
    };
    const candidateListener = (event: RTCPeerConnectionIceEvent) => { if (!event.candidate) finish(); };
    connection.addEventListener("icegatheringstatechange", stateListener);
    connection.addEventListener("icecandidate", candidateListener);
  });
}

export async function createOutgoingPeer(): Promise<OutgoingPeer> {
  const sessionId = crypto.randomUUID();
  const connection = new RTCPeerConnection({ iceServers: [] });
  const channel = connection.createDataChannel(CHANNEL, { ordered: true });
  await connection.setLocalDescription(await connection.createOffer());
  await waitForIceGathering(connection);
  if (!connection.localDescription) throw new Error("WebRTC did not produce an offer");
  return { sessionId, connection, channel, offer: { protocol: "opus-lan-pairing", version: 1, sessionId, description: connection.localDescription.toJSON() } };
}

export async function acceptPairingOffer(offer: PairingSignal): Promise<IncomingPeer> {
  validatePairingSignal(offer, "offer");
  const connection = new RTCPeerConnection({ iceServers: [] });
  const channel = new Promise<RTCDataChannel>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Timed out waiting for sync data channel")), 30_000);
    connection.addEventListener("datachannel", (event) => {
      if (event.channel.label !== CHANNEL) return;
      window.clearTimeout(timeout);
      resolve(event.channel);
    });
  });
  await connection.setRemoteDescription(offer.description);
  await connection.addIceCandidate(null);
  await connection.setLocalDescription(await connection.createAnswer());
  await waitForIceGathering(connection);
  if (!connection.localDescription) throw new Error("WebRTC did not produce an answer");
  return { sessionId: offer.sessionId, connection, channel, answer: { protocol: "opus-lan-pairing", version: 1, sessionId: offer.sessionId, description: connection.localDescription.toJSON() } };
}

export async function applyPairingAnswer(peer: OutgoingPeer, answer: PairingSignal) {
  validatePairingSignal(answer, "answer");
  if (answer.sessionId !== peer.sessionId) throw new Error("Pairing answer belongs to another session");
  await peer.connection.setRemoteDescription(answer.description);
  await peer.connection.addIceCandidate(null);
}

export function validatePairingSignal(signal: PairingSignal, expectedType?: RTCSdpType) {
  if (signal?.protocol !== "opus-lan-pairing" || signal.version !== 1 || typeof signal.sessionId !== "string") throw new Error("Unsupported pairing signal");
  if (!signal.description || typeof signal.description.sdp !== "string" || (expectedType && signal.description.type !== expectedType)) throw new Error("Invalid pairing description");
  return signal;
}

export function waitForDataChannel(channel: RTCDataChannel, timeout = 30_000) {
  if (channel.readyState === "open") return Promise.resolve(channel);
  return new Promise<RTCDataChannel>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Timed out opening sync data channel")), timeout);
    channel.addEventListener("open", () => { window.clearTimeout(timer); resolve(channel); }, { once: true });
    channel.addEventListener("error", () => { window.clearTimeout(timer); reject(new Error("Sync data channel failed")); }, { once: true });
  });
}

async function waitForBuffer(channel: RTCDataChannel) {
  if (channel.bufferedAmount < 256_000) return;
  channel.bufferedAmountLowThreshold = 64_000;
  await new Promise<void>((resolve) => channel.addEventListener("bufferedamountlow", () => resolve(), { once: true }));
}

export function waitForControl(channel: RTCDataChannel, kind: string, timeout = 15_000) {
 return new Promise<void>((resolve, reject) => {
   const timer = window.setTimeout(() => finish(new Error(`Timed out waiting for ${kind}`)), timeout);
   const finish = (error?: Error) => { window.clearTimeout(timer); channel.removeEventListener("message", listener); if (error) reject(error); else resolve(); };
   const listener = (event: MessageEvent<string>) => {
     try {
       const message = JSON.parse(event.data) as { protocol?: string; kind?: string };
       if (message.protocol === "opus-control" && message.kind === kind) finish();
     } catch { /* Not a control frame. */ }
   };
   channel.addEventListener("message", listener);
 });
}
export async function sendControl(channel: RTCDataChannel, kind: string) {
 await waitForDataChannel(channel);
 channel.send(JSON.stringify({ protocol: "opus-control", kind }));
}
export async function sendChunkedJson(channel: RTCDataChannel, value: unknown) {
  await waitForDataChannel(channel);
  const payload = JSON.stringify(value);
  const transferId = crypto.randomUUID();
  const chunks = Array.from({ length: Math.ceil(payload.length / CHUNK_SIZE) }, (_, index) => payload.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE));
  channel.send(JSON.stringify({ protocol: "opus-chunks", kind: "start", transferId, total: chunks.length }));
  for (const [index, data] of chunks.entries()) {
    await waitForBuffer(channel);
    channel.send(JSON.stringify({ protocol: "opus-chunks", kind: "chunk", transferId, index, data }));
  }
  channel.send(JSON.stringify({ protocol: "opus-chunks", kind: "complete", transferId }));
  return transferId;
}

export function receiveChunkedJson<T>(channel: RTCDataChannel, timeout = 30_000) {
  return new Promise<T>((resolve, reject) => {
    let transferId = "";
    let chunks: string[] = [];
    const timer = window.setTimeout(() => finish(new Error("Timed out receiving LAN transfer")), timeout);
    const finish = (error?: Error, value?: T) => {
      window.clearTimeout(timer);
      channel.removeEventListener("message", listener);
      if (error) reject(error); else resolve(value as T);
    };
    const listener = (event: MessageEvent<string>) => {
      let message: { protocol?: string; kind?: string; transferId?: string; total?: number; index?: number; data?: string };
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.protocol !== "opus-chunks") return;
      if (message.kind === "start") {
        if (!message.transferId || !Number.isInteger(message.total) || message.total! < 1 || message.total! > 100_000) return finish(new Error("Invalid transfer header"));
        transferId = message.transferId;
        chunks = new Array(message.total);
      } else if (message.transferId === transferId && message.kind === "chunk" && Number.isInteger(message.index) && typeof message.data === "string") {
        chunks[message.index!] = message.data;
      } else if (message.transferId === transferId && message.kind === "complete") {
        if (chunks.some((chunk) => typeof chunk !== "string")) return finish(new Error("Transfer completed with missing chunks"));
        try { finish(undefined, JSON.parse(chunks.join("")) as T); } catch { finish(new Error("Transferred JSON is invalid")); }
      }
    };
    channel.addEventListener("message", listener);
  });
}

export function closePeer(connection: RTCPeerConnection) {
  connection.getSenders().forEach((sender) => sender.track?.stop());
  connection.close();
}
