import type { LearnerState } from "../types";

export type DeviceId = string;
export type EventId = `${DeviceId}:${number}`;

export type HybridTimestamp = {
  wallTime: number;
  logical: number;
  deviceId: DeviceId;
};

export type SyncEntity = {
  kind: "deck" | "card" | "review" | "session" | "device" | "history";
  id: string;
};

export type SyncEvent<T = unknown> = {
  id: EventId;
  deviceId: DeviceId;
  counter: number;
  clock: HybridTimestamp;
  entity: SyncEntity;
  entityKey: string;
  operation: string;
  payload: T;
  previous?: EventId;
};

export type DeviceIdentity = {
  deviceId: DeviceId;
  counter: number;
  clock: HybridTimestamp;
  createdAt: number;
};

export type SnapshotRecord = {
  id: string;
  schemaVersion: 1;
  createdAt: number;
  deviceId: DeviceId;
  frontier: Record<DeviceId, number>;
  digest: string;
  state: LearnerState;
};
