import { expect, test } from "@playwright/test";
import { advanceHybridClock, compareHybridClock } from "../src/sync/clock";
import { mergeEventSets } from "../src/sync/events";
import { createDeckGift, materializeGiftDeck, parseDeckGift, serializeDeckGift } from "../src/sync/deckGift";
import type { SyncEvent } from "../src/sync/types";
import type { Deck } from "../src/types";

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

test("Deck Gifts verify content and materialize independent copies", async () => {
  const source: Deck = { id: "source", name: "Shared Mycology", domain: "Mycology", symbol: "life", description: "Fungal cards", questions: [{ id: "hypha", prompt: "What is a hypha?", answer: "A fungal filament." }] };
  const gift = await createDeckGift(source, "device-a");
  const parsed = await parseDeckGift(serializeDeckGift(gift));
  const copy = materializeGiftDeck(parsed);
  expect(copy.id).not.toBe(source.id);
  expect(copy.questions[0].id).toBe(`${copy.id}:hypha`);
  expect(copy.provenance).toMatchObject({ sourceDeckId: "source", sourceDigest: gift.digest });
  const replacement = materializeGiftDeck(parsed, copy);
  expect(replacement.id).toBe(copy.id);
});

test("Deck Gifts reject tampered content", async () => {
  const source: Deck = { id: "source", name: "Latin", domain: "Language", symbol: "language", description: "", questions: [{ id: "one", prompt: "Salve", answer: "Hello" }] };
  const gift = await createDeckGift(source);
  gift.content.cards[0].answer = "Tampered";
  await expect(parseDeckGift(serializeDeckGift(gift))).rejects.toThrow("digest");
});

test("Deck Gift imports persist without learner progress", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const gifts = await import("/src/sync/deckGift.ts");
    const gift = await gifts.createDeckGift({ id: "shared-fungi", name: "Forest Fungi", domain: "Mycology", symbol: "life", description: "A gift from another learner", questions: [{ id: "spore", prompt: "What is a spore?", answer: "A reproductive unit." }] }, "peer-device");
    const imported = gifts.materializeGiftDeck(await gifts.parseDeckGift(gifts.serializeDeckGift(gift)));
    const stored = JSON.parse(localStorage.getItem("opus-pusillium:learner:v1") ?? "{}");
    localStorage.setItem("opus-pusillium:learner:v1", JSON.stringify({ ...stored, customDecks: [...(stored.customDecks ?? []), imported] }));
    return imported;
  });
  expect(result.provenance.sourceDeckId).toBe("shared-fungi");
  await page.reload();
  await page.getByRole("button", { name: "Decks" }).click();
  await expect(page.getByRole("article", { name: "Forest Fungi deck" })).toContainText("1 ready");
});

test("Library opens the camera-first Deck Gift workflow", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Decks" }).click();
  await page.getByRole("button", { name: "Receive deck" }).click();
  const dialog = page.getByRole("dialog", { name: "Share deck over local network" });
  await expect(dialog).toContainText("Receive a deck");
  await expect(dialog.getByRole("button", { name: "Scan sender’s QR" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("receive-gift.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close deck sharing" }).click();
  await page.getByRole("button", { name: "Edit Latin deck" }).click();
  await page.getByRole("button", { name: "Share over LAN" }).click();
  await expect(page.getByRole("dialog", { name: "Share deck over local network" })).toContainText("Progress, scheduling, XP, and review history stay on this device");
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

test("WebRTC peers exchange a chunked Deck Gift payload", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const transport = await import("/src/sync/webrtc.ts");
    const within = <T>(promise: Promise<T>, label: string) => Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timed out: ${label}`)), 7_000))]);
    const outgoing = await within(transport.createOutgoingPeer(), "offer");
    const incoming = await within(transport.acceptPairingOffer(outgoing.offer), "answer");
    await within(transport.applyPairingAnswer(outgoing, incoming.answer), "apply answer");
    const [sender, receiver] = await within(Promise.all([transport.waitForDataChannel(outgoing.channel), incoming.channel.then((channel) => transport.waitForDataChannel(channel))]), "open channels");
    const payload = { protocol: "opus-deck-gift", cards: Array.from({ length: 600 }, (_, index) => ({ id: index, prompt: `Prompt ${index} ${"x".repeat(80)}` })) };
    const received = transport.receiveChunkedJson<typeof payload>(receiver);
    await transport.sendChunkedJson(sender, payload);
    const value = await within(received, "receive payload");
    transport.closePeer(outgoing.connection);
    transport.closePeer(incoming.connection);
    return { count: value.cards.length, last: value.cards.at(-1)?.id };
  });
  expect(result).toEqual({ count: 600, last: 599 });
});

test("pairing signals survive compressed QR encoding", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const transport = await import("/src/sync/webrtc.ts");
    const outgoing = await transport.createOutgoingPeer();
    const encoded = await transport.encodePairingSignal(outgoing.offer);
    const decoded = await transport.decodePairingSignal(encoded);
    transport.closePeer(outgoing.connection);
    return { encoded, original: outgoing.offer, decoded };
  });
  expect(result.encoded).toMatch(/^opus-pairing:1:(gzip|json):/);
  expect(result.decoded).toEqual(result.original);
});
