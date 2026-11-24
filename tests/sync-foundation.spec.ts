import { expect, test } from "@playwright/test";
import { advanceHybridClock, compareHybridClock } from "../src/sync/clock";
import { mergeEventSets } from "../src/sync/events";
import type { SyncEvent } from "../src/sync/types";

const event = (deviceId: string, counter: number, wallTime: number, logical = 0): SyncEvent => ({
  id: `${deviceId}:${counter}`,
  deviceId,
  counter,
  clock: { wallTime, logical, deviceId },
  entity: { kind: "card", id: "card-1" },
  entityKey: "card:card-1",
  operation: "card.fieldChanged",
  payload: { prompt: `${deviceId}-${counter}` },
});

test("hybrid clocks stay monotonic across skewed devices", () => {
  const first = advanceHybridClock("device-a", null, 1_000);
  const local = advanceHybridClock("device-a", first, 900);
  const remote = advanceHybridClock("device-b", null, 1_500);
  const merged = advanceHybridClock("device-a", local, 1_100, remote);
  expect(compareHybridClock(first, local)).toBeLessThan(0);
  expect(compareHybridClock(local, merged)).toBeLessThan(0);
  expect(merged.wallTime).toBe(1_500);
  expect(merged.logical).toBe(remote.logical + 1);
});

test("event-set merging is commutative and idempotent", () => {
  const left = [event("device-a", 1, 100), event("device-a", 2, 200)];
  const right = [event("device-b", 1, 150), left[1]];
  expect(mergeEventSets(left, right)).toEqual(mergeEventSets(right, left));
  expect(mergeEventSets(left, left)).toEqual(left);
});

test("app bootstraps the IndexedDB sync stores and checkpoint", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open("opus-pusillium-sync");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = [...database.objectStoreNames];
    const transaction = database.transaction(["events", "snapshots", "metadata"], "readonly");
    const read = <T>(requestValue: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
      requestValue.onsuccess = () => resolve(requestValue.result);
      requestValue.onerror = () => reject(requestValue.error);
    });
    const [events, snapshots, identity] = await Promise.all([
      read(transaction.objectStore("events").getAll()),
      read(transaction.objectStore("snapshots").getAll()),
      read(transaction.objectStore("metadata").get("identity")),
    ]);
    database.close();
    return { stores, events, snapshots, identity };
  })).toMatchObject({
    stores: ["conflicts", "devices", "events", "metadata", "snapshots", "transfers"],
    events: [{ operation: "history.checkpoint" }],
    snapshots: [{ schemaVersion: 1 }],
    identity: { key: "identity", value: { counter: 1 } },
  });

  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("button", { name: /Adept/ }).click();
  await expect.poll(() => page.evaluate(async () => {
    const request = indexedDB.open("opus-pusillium-sync");
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("events", "readonly");
    const events = await new Promise<Array<{ operation: string }>>((resolve, reject) => {
      const all = transaction.objectStore("events").getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    });
    database.close();
    return events.map((event) => event.operation);
  })).toContain("preference.changed");
});
