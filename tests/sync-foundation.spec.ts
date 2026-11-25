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
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await expect(dialog).toContainText("Receive a deck");
  await expect(dialog.getByRole("button", { name: "Scan sender’s QR" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("receive-gift.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Close deck sharing" }).click();
  await page.getByRole("button", { name: "Edit Latin deck" }).click();
  await page.getByRole("button", { name: "Share over LAN" }).click();
  await expect(page.getByRole("dialog", { name: "Share deck over local network" })).toContainText("Progress, scheduling, XP, and review history stay on this device");
});

test("trusted sync materializes reviews, sessions, edits, and preferences deterministically", async () => {
  const { materializeLearnerState, mergeTrustedBundles } = await import("../src/sync/trusted");
  const { defaultLearnerState } = await import("../src/storage");
  const base = defaultLearnerState();
  const studyDay = new Date().toISOString().slice(0, 10);
  const make = (deviceId: string, counter: number, operation: string, entityKind: string, entityId: string, payload: unknown, wallTime: number): SyncEvent => ({
    id: `${deviceId}:${counter}`, deviceId, counter, clock: { wallTime, logical: 0, deviceId },
    entity: { kind: entityKind as SyncEvent["entity"]["kind"], id: entityId },
    entityKey: `${entityKind}:${entityId}`, operation, payload,
  });
  const e1 = make("device-a", 1, "review.recorded", "review", "r1", { deckId: "latin", cardId: "latin-1", rating: "hard", reducedXp: false, rank: 0 }, 100);
  const e2 = make("device-a", 2, "session.completed", "session", "s1", { deckId: "latin", day: studyDay }, 101);
  const e3 = make("device-b", 1, "review.recorded", "review", "r2", { deckId: "latin", cardId: "latin-2", rating: "easy", reducedXp: false, rank: 0 }, 102);
  const e4 = make("device-b", 2, "session.completed", "session", "s2", { deckId: "latin", day: studyDay }, 103);
  const e5 = make("device-b", 3, "deck.edited", "deck", "latin", { name: "Latin Shared" }, 104);
  const e6 = make("device-a", 3, "preference.changed", "device", "preferences", { field: "difficulty", value: "scholar" }, 105);

  const local = base;
  const localBundle = { protocol: "opus-trusted-sync" as const, version: 1 as const, deviceId: "device-a", deviceName: "A", sentAt: 1, baseExperience: 0, state: base, events: [e1, e2, e6] };
  const remoteBundle = { protocol: "opus-trusted-sync" as const, version: 1 as const, deviceId: "device-b", deviceName: "B", sentAt: 2, baseExperience: 0, state: { ...base, experience: 2 }, events: [e3, e4, e5] };
  const first = mergeTrustedBundles(localBundle, remoteBundle, local);
  const second = mergeTrustedBundles(remoteBundle, localBundle, base);
  expect(first.state.experience).toBe(8);
  expect(first.state.cards["latin:latin-1"]).toBeDefined();
  expect(first.state.cards["latin:latin-2"]).toBeDefined();
  expect(first.state.deckEdits.latin.name).toBe("Latin Shared");
  expect(first.state.difficulty).toBe("scholar");
  expect(first.state.decks.latin.sessionsCompleted).toBe(2);
  expect(second.state.experience).toBe(first.state.experience);
  expect(second.state.cards).toEqual(first.state.cards);
  expect(materializeLearnerState([e1, e2], [], base, base.librarySort).cards["latin:latin-1"]).toBeDefined();
});

test("trusted sync encryption rejects a wrong passphrase and hides plaintext", async () => {
  const trusted = await import("../src/sync/trusted");
  const bundle = { protocol: "opus-trusted-sync" as const, version: 1 as const, deviceId: "device-a", deviceName: "A", sentAt: 1, baseExperience: 0, state: (await import("../src/storage")).defaultLearnerState(), events: [] };
  const key = await trusted.derivePairKey("correct horse battery", "session-1");
  const packet = await trusted.encryptBundle(bundle, key, "device-a", "Laptop", "abc123");
  expect(packet).not.toContain("correct horse battery");
  const decoded = await trusted.decryptBundle(packet, key);
  expect(decoded.bundle.deviceId).toBe("device-a");
  const wrongKey = await trusted.derivePairKey("incorrect horse battery", "session-1");
  await expect(trusted.decryptBundle(packet, wrongKey)).rejects.toThrow("passphrase");
});

test("two devices exchange and merge encrypted trusted-sync bundles", async ({ page }) => {
  await page.goto("/");
  const merged = await page.evaluate(async () => {
    const transport = await import("/src/sync/webrtc.ts");
    const trusted = await import("/src/sync/trusted.ts");
    const storage = await import("/src/storage.ts");
    const outgoing = await transport.createOutgoingPeer();
    const incoming = await transport.acceptPairingOffer(outgoing.offer);
    await transport.applyPairingAnswer(outgoing, incoming.answer);
    const senderChannel = await transport.waitForDataChannel(outgoing.channel);
    const receiverChannel = await transport.waitForDataChannel(await incoming.channel);
    const aReady = transport.waitForControl(senderChannel, "ready");
    const bReady = transport.waitForControl(receiverChannel, "ready");
    await Promise.all([transport.sendControl(senderChannel, "ready"), transport.sendControl(receiverChannel, "ready")]);
    await Promise.all([aReady, bReady]);

    const passphrase = "shared passphrase 42";
    const keyA = await trusted.derivePairKey(passphrase, outgoing.sessionId);
    const keyB = await trusted.derivePairKey(passphrase, outgoing.sessionId);
    const base = storage.defaultLearnerState();
    const bundleA = { protocol: "opus-trusted-sync" as const, version: 1 as const, deviceId: "device-a", deviceName: "A", sentAt: 1, baseExperience: 0, state: base, events: [{ id: "device-a:1", deviceId: "device-a", counter: 1, clock: { wallTime: 10, logical: 0, deviceId: "device-a" }, entity: { kind: "review" as const, id: "r" }, entityKey: "review:r", operation: "review.recorded", payload: { deckId: "latin", cardId: "latin-1", rating: "hard", reducedXp: false, rank: 0 } }] };
    const bundleB = { ...bundleA, deviceId: "device-b", deviceName: "B", events: [{ ...bundleA.events[0], id: "device-b:1", deviceId: "device-b", counter: 1, clock: { wallTime: 20, logical: 0, deviceId: "device-b" }, payload: { deckId: "latin", cardId: "latin-2", rating: "easy", reducedXp: false, rank: 0 } }] };
    const packetA = await trusted.encryptBundle(bundleA, keyA, "device-a", "A", "fp");
    const packetB = await trusted.encryptBundle(bundleB, keyB, "device-b", "B", "fp");
    const receivedB = transport.receiveChunkedJson<string>(receiverChannel);
    const receivedA = transport.receiveChunkedJson<string>(senderChannel);
    await Promise.all([transport.sendChunkedJson(senderChannel, packetA), transport.sendChunkedJson(receiverChannel, packetB)]);
    const [packetForA, packetForB] = await Promise.all([receivedA, receivedB]);
    const remoteForA = await trusted.decryptBundle(packetForA, keyA);
    const remoteForB = await trusted.decryptBundle(packetForB, keyB);
    const result = trusted.mergeTrustedBundles(bundleA, remoteForA.bundle, base);
    const reverse = trusted.mergeTrustedBundles(bundleB, remoteForB.bundle, base);
    transport.closePeer(outgoing.connection);
    transport.closePeer(incoming.connection);
    return { xp: result.state.experience, reverseXp: reverse.state.experience, cards: Object.keys(result.state.cards).sort() };
  });
  expect(merged).toEqual({ xp: 8, reverseXp: 8, cards: ["latin:latin-1", "latin:latin-2"] });
});

test("Profile exposes passphrase-protected trusted-device sync", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(() => {
    const devices = [{ deviceId: "peer-1", name: "Laptop", fingerprint: "abc123def456", salt: "salt-1", verifier: "invalid", pairedAt: Date.now(), lastSyncedAt: null }];
    localStorage.setItem("opus-pusillium:trusted-devices:v1", JSON.stringify(devices));
  });
  await page.reload();
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Pair or sync device" }).click();
  const dialog = page.getByRole("dialog", { name: "Trusted device sync" });
  await expect(dialog).toContainText("passphrase");
  await page.screenshot({ path: testInfo.outputPath("trusted-sync.png"), fullPage: true });
  await dialog.getByRole("button", { name: "Start pairing" }).click();
  await expect(dialog.getByLabel("Sync passphrase")).toBeVisible();
  await dialog.getByLabel("Sync passphrase").fill("short");
  await expect(dialog.getByRole("button", { name: "Create offer" })).toBeDisabled();
  await dialog.getByLabel("Sync passphrase").fill("correct horse battery");
  await expect(dialog.getByRole("button", { name: "Create offer" })).toBeEnabled();
  await dialog.getByRole("button", { name: "Create offer" }).click();
  const qr = dialog.locator(".qr-image canvas");
  await expect(qr).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: testInfo.outputPath("trusted-qr.png"), fullPage: true });
  const qrCheck = await qr.evaluate((canvas: HTMLCanvasElement) => {
    const context = canvas.getContext("2d")!;
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let black = 0;
    let white = 0;
    for (let index = 0; index < data.length; index += 4) {
      const value = data[index];
      if (value < 10) black += 1;
      if (value > 245) white += 1;
    }
    return { width: canvas.width, black, white, text: canvas.parentElement?.parentElement?.textContent ?? "" };
  });
  expect(qrCheck.width).toBeGreaterThanOrEqual(600);
  expect(qrCheck.black).toBeGreaterThan(1_000);
  expect(qrCheck.white).toBeGreaterThan(qrCheck.black);
  expect(qrCheck.text).toContain("Copy pairing code");
});

test("a known trusted device requires its saved passphrase", async ({ page }) => {
  await page.goto("/");
  const verifier = await page.evaluate(async () => {
    const trusted = await import("/src/sync/trusted.ts");
    const value = await trusted.makeVerifier("correct horse battery", "known-salt");
    localStorage.setItem("opus-pusillium:trusted-devices:v1", JSON.stringify([{ deviceId: "peer-known", name: "Laptop", fingerprint: value.fingerprint, salt: value.salt, verifier: value.verifier, pairedAt: Date.now(), lastSyncedAt: null }]));
    return value.verifier;
  });
  expect(verifier).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Profile" }).click();
  await page.getByRole("button", { name: "Pair or sync device" }).click();
  const dialog = page.getByRole("dialog", { name: "Trusted device sync" });
  await dialog.getByRole("button", { name: "Sync", exact: true }).click();
  await dialog.getByLabel("Sync passphrase").fill("wrong horse battery");
  await dialog.getByRole("button", { name: "Create offer" }).click();
  await expect(dialog.getByRole("alert")).toContainText("passphrase does not unlock");
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
