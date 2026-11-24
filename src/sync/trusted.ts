import type { DeckEdit, LearnerState, Rating } from "../types";
import { cardKey, experienceForReview, freshProgress, rankForFailures, reviewCard } from "../scheduler";
import { defaultLearnerState, todayKey } from "../storage";
import { compareSyncEvents, mergeEventSets } from "./events";
import type { DeviceId, SyncEvent } from "./types";

export const TRUSTED_CHANNEL = "opus-trusted-sync";
export const TRUSTED_PROTOCOL = "opus-trusted-sync";

export type TrustedBundle = {
  protocol: typeof TRUSTED_PROTOCOL;
  version: 1;
  deviceId: DeviceId;
  deviceName: string;
  sentAt: number;
  baseExperience: number;
  state: LearnerState;
  events: SyncEvent[];
};

export type EncryptedPacket = {
  protocol: "opus-encrypted";
  version: 1;
  senderId: DeviceId;
  senderName: string;
  fingerprint: string;
  iv: string;
  data: string;
};

export type TrustedDeviceRecord = {
  deviceId: DeviceId;
  name: string;
  fingerprint: string;
  salt: string;
  verifier: string;
  pairedAt: number;
  lastSyncedAt: number | null;
};

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 16_384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16_384));
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function derivePairKey(passphrase: string, sessionId: string) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(`opus-trusted-sync:${sessionId}`), iterations: 180_000 },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function makeVerifier(passphrase: string, salt: string = crypto.randomUUID()) {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(`opus-verifier:${salt}`), iterations: 180_000 }, material, 128);
  const verifier = bytesToBase64(new Uint8Array(bits));
  return { salt, verifier, fingerprint: verifier.slice(0, 12) };
}

export async function encryptBundle(bundle: TrustedBundle, key: CryptoKey, senderId: DeviceId, senderName: string, fingerprint: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(TRUSTED_PROTOCOL) }, key, new TextEncoder().encode(JSON.stringify(bundle)));
  return JSON.stringify({ protocol: "opus-encrypted", version: 1, senderId, senderName, fingerprint, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(data)) } satisfies EncryptedPacket);
}

export async function decryptBundle(packetText: string, key: CryptoKey) {
  const packet = JSON.parse(packetText) as EncryptedPacket;
  if (packet.protocol !== "opus-encrypted" || packet.version !== 1 || typeof packet.data !== "string" || typeof packet.iv !== "string") throw new Error("Unsupported trusted-sync packet");
  let clear: ArrayBuffer;
  try {
    clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(packet.iv), additionalData: new TextEncoder().encode(TRUSTED_PROTOCOL) }, key, base64ToBytes(packet.data));
  } catch { throw new Error("The passphrase is incorrect or the sync packet was altered"); }
  const bundle = JSON.parse(new TextDecoder().decode(clear)) as TrustedBundle;
  if (bundle.protocol !== TRUSTED_PROTOCOL || bundle.version !== 1 || bundle.deviceId !== packet.senderId || !Array.isArray(bundle.events)) throw new Error("Invalid trusted-sync bundle");
  return { bundle, sender: { deviceId: packet.senderId, name: packet.senderName, fingerprint: packet.fingerprint } };
}

export function bundleFromState(state: LearnerState, events: SyncEvent[], deviceId: DeviceId, deviceName: string, baseExperience = 0): TrustedBundle {
  return { protocol: TRUSTED_PROTOCOL, version: 1, deviceId, deviceName, sentAt: Date.now(), baseExperience, state, events };
}

type ReviewPayload = { deckId: string; cardId: string; rating: Rating; reducedXp: boolean; rank?: 0 | 1 | 2 | 3 };
type SessionPayload = { deckId: string; day: string };

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function materializeLearnerState(events: SyncEvent[], customDecks: LearnerState["customDecks"], fallback: LearnerState, librarySort: LearnerState["librarySort"], baseExperience = 0) {
  const state: LearnerState = { ...defaultLearnerState(), customDecks, librarySort };
  const allEvents = mergeEventSets(events);
  const sessions = new Map<string, Map<string, number>>();
  const studyDays = new Set<string>();
  let experience = 0;

  for (const event of allEvents) {
    if (event.operation === "review.recorded") {
      const payload = event.payload as ReviewPayload;
      if (!payload?.deckId || !payload.cardId || !["again", "hard", "good", "easy"].includes(payload.rating)) continue;
      const key = cardKey(payload.deckId, payload.cardId);
      const previous = state.cards[key] ?? freshProgress(event.clock.wallTime);
      const rank = payload.rank ?? rankForFailures(previous.failures);
      const next = reviewCard(previous, payload.rating, event.clock.wallTime);
      state.cards[key] = next;
      experience += experienceForReview(payload.rating, rank, payload.reducedXp);
    } else if (event.operation === "session.completed") {
      const payload = event.payload as SessionPayload;
      if (!payload?.deckId || !/^\d{4}-\d{2}-\d{2}$/.test(payload.day ?? "")) continue;
      studyDays.add(payload.day);
      const days = sessions.get(payload.deckId) ?? new Map<string, number>();
      days.set(payload.day, (days.get(payload.day) ?? 0) + 1);
      sessions.set(payload.deckId, days);
      if (!state.lastStudyDate || payload.day > state.lastStudyDate) state.lastStudyDate = payload.day;
    } else if (event.operation === "preference.changed") {
      const payload = event.payload as { field: string; value: string };
      if (payload?.field === "difficulty" && ["adventurer", "scholar", "adept"].includes(payload.value)) state.difficulty = payload.value as LearnerState["difficulty"];
    } else if (event.operation === "deck.activationChanged") {
      const payload = event.payload as { active: boolean };
      state.decks[event.entity.id] = { ...(state.decks[event.entity.id] ?? { active: event.entity.id === "latin", sessionDate: "", sessionsCompleted: 0 }), active: Boolean(payload?.active) };
    } else if (event.operation === "deck.edited") {
      state.deckEdits[event.entity.id] = event.payload as DeckEdit;
    }
  }

  state.experience = baseExperience + experience;
  const today = todayKey();
  for (const [deckId, days] of sessions) {
    state.decks[deckId] = { active: state.decks[deckId]?.active ?? deckId === "latin", sessionDate: today, sessionsCompleted: Math.min(2, days.get(today) ?? 0) };
  }
  if (studyDays.size > 0) {
    const ordered = [...studyDays].sort().reverse();
    let streak = 1;
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index - 1] === addDays(ordered[index], 1)) streak += 1;
      else break;
    }
    state.streak = streak;
    state.lastStudyDate = ordered[0];
  }
  return state;
}

export function mergeTrustedBundles(local: TrustedBundle, remote: TrustedBundle, localState: LearnerState) {
  const events = mergeEventSets(local.events, remote.events);
  const decks = new Map<string, LearnerState["customDecks"][number]>();
  for (const deck of [...localState.customDecks, ...local.state.customDecks, ...remote.state.customDecks]) {
    const existing = decks.get(deck.id);
    if (!existing || (deck.provenance?.importedAt ?? 0) > (existing.provenance?.importedAt ?? 0)) decks.set(deck.id, deck);
  }
  const state = materializeLearnerState(events, [...decks.values()], localState, localState.librarySort, Math.max(local.baseExperience ?? 0, remote.baseExperience ?? 0));
  return { state, events };
}

export function sortReviewChronology(events: SyncEvent[]) {
  return [...events].sort(compareSyncEvents);
}
