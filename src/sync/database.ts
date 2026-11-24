import type { LearnerState } from "../types";
import { advanceHybridClock, compareHybridClock } from "./clock";
import { sha256 } from "./events";
import type { DeviceIdentity, EventId, SnapshotRecord, SyncEntity, SyncEvent } from "./types";

const DATABASE = "opus-pusillium-sync";
const VERSION = 1;

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function openSyncDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const events = database.createObjectStore("events", { keyPath: "id" });
      events.createIndex("entityKey", "entityKey", { unique: false });
      events.createIndex("deviceId", "deviceId", { unique: false });
      events.createIndex("wallTime", "clock.wallTime", { unique: false });
      database.createObjectStore("snapshots", { keyPath: "id" });
      database.createObjectStore("metadata", { keyPath: "key" });
      database.createObjectStore("devices", { keyPath: "deviceId" });
      database.createObjectStore("transfers", { keyPath: "id" });
      database.createObjectStore("conflicts", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getMetadata<T>(store: IDBObjectStore, key: string) {
  const entry = await requestResult<{ key: string; value: T } | undefined>(store.get(key));
  return entry?.value;
}

function putMetadata<T>(store: IDBObjectStore, key: string, value: T) {
  store.put({ key, value });
}

function newIdentity(now = Date.now()): DeviceIdentity {
  const deviceId = crypto.randomUUID();
  return { deviceId, counter: 0, clock: { wallTime: now, logical: 0, deviceId }, createdAt: now };
}

export async function initializeSyncFoundation(state: LearnerState) {
  const digest = await sha256(state);
  const database = await openSyncDatabase();
  const transaction = database.transaction(["events", "snapshots", "metadata", "devices"], "readwrite");
  const metadata = transaction.objectStore("metadata");
  let identity = await getMetadata<DeviceIdentity>(metadata, "identity");
  if (!identity) {
    identity = newIdentity();
    putMetadata(metadata, "identity", identity);
    transaction.objectStore("devices").put({ deviceId: identity.deviceId, name: "This device", trusted: true, createdAt: identity.createdAt });
  }
  const initialized = await getMetadata<number>(metadata, "bootstrapVersion");
  if (!initialized) {
    const counter = identity.counter + 1;
    const clock = advanceHybridClock(identity.deviceId, identity.clock);
    const event: SyncEvent<{ snapshotId: string; digest: string }> = {
      id: `${identity.deviceId}:${counter}` as EventId,
      deviceId: identity.deviceId,
      counter,
      clock,
      entity: { kind: "history", id: "learner-state" },
      entityKey: "history:learner-state",
      operation: "history.checkpoint",
      payload: { snapshotId: `bootstrap:${identity.deviceId}`, digest },
    };
    const snapshot: SnapshotRecord = {
      id: event.payload.snapshotId,
      schemaVersion: 1,
      createdAt: clock.wallTime,
      deviceId: identity.deviceId,
      frontier: { [identity.deviceId]: counter },
      digest,
      state,
    };
    transaction.objectStore("events").put(event);
    transaction.objectStore("snapshots").put(snapshot);
    identity = { ...identity, counter, clock };
    putMetadata(metadata, "identity", identity);
    putMetadata(metadata, "bootstrapVersion", 1);
  }
  await transactionDone(transaction);
  database.close();
  return identity;
}

export async function appendLocalEvent<T>(entity: SyncEntity, operation: string, payload: T, previous?: EventId) {
  const database = await openSyncDatabase();
  const transaction = database.transaction(["events", "metadata", "devices"], "readwrite");
  const metadata = transaction.objectStore("metadata");
  let identity = await getMetadata<DeviceIdentity>(metadata, "identity");
  if (!identity) {
    identity = newIdentity();
    putMetadata(metadata, "identity", identity);
    transaction.objectStore("devices").put({ deviceId: identity.deviceId, name: "This device", trusted: true, createdAt: identity.createdAt });
  }
  const counter = identity.counter + 1;
  const clock = advanceHybridClock(identity.deviceId, identity.clock);
  const event: SyncEvent<T> = {
    id: `${identity.deviceId}:${counter}` as EventId, deviceId: identity.deviceId, counter, clock, entity,
    entityKey: `${entity.kind}:${entity.id}`, operation, payload, previous,
  };
  transaction.objectStore("events").add(event);
  putMetadata(metadata, "identity", { ...identity, counter, clock });
  await transactionDone(transaction);
  database.close();
  return event;
}

export async function mergeRemoteEvents(events: SyncEvent[]) {
  const database = await openSyncDatabase();
  const transaction = database.transaction(["events", "metadata"], "readwrite");
  const store = transaction.objectStore("events");
  const existing = await Promise.all(events.map((event) => requestResult(store.getKey(event.id))));
  let added = 0;
  events.forEach((event, index) => { if (existing[index] === undefined) { store.add(event); added += 1; } });
  const metadata = transaction.objectStore("metadata");
  const identity = await getMetadata<DeviceIdentity>(metadata, "identity");
  const newestRemote = [...events].sort((left, right) => compareHybridClock(right.clock, left.clock))[0];
  if (identity && newestRemote) putMetadata(metadata, "identity", { ...identity, clock: advanceHybridClock(identity.deviceId, identity.clock, Date.now(), newestRemote.clock) });
  await transactionDone(transaction);
  database.close();
  return added;
}

export async function listSyncEvents() {
  const database = await openSyncDatabase();
  const transaction = database.transaction("events", "readonly");
  const events = await requestResult<SyncEvent[]>(transaction.objectStore("events").getAll());
  await transactionDone(transaction);
  database.close();
  return events;
}

export async function getDeviceIdentity() {
  const database = await openSyncDatabase();
  const transaction = database.transaction("metadata", "readonly");
  const identity = await getMetadata<DeviceIdentity>(transaction.objectStore("metadata"), "identity");
  await transactionDone(transaction);
  database.close();
  return identity;
}
