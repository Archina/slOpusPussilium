import { compareHybridClock } from "./clock";
import type { SyncEvent } from "./types";

export function compareSyncEvents(left: SyncEvent, right: SyncEvent) {
  return compareHybridClock(left.clock, right.clock) || left.counter - right.counter || left.id.localeCompare(right.id);
}

export function mergeEventSets(...sets: SyncEvent[][]) {
  const events = new Map<string, SyncEvent>();
  for (const set of sets) for (const event of set) events.set(event.id, event);
  return [...events.values()].sort(compareSyncEvents);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

export async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
