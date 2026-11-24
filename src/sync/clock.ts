import type { DeviceId, HybridTimestamp } from "./types";

export function compareHybridClock(left: HybridTimestamp, right: HybridTimestamp) {
  return left.wallTime - right.wallTime || left.logical - right.logical || left.deviceId.localeCompare(right.deviceId);
}

export function advanceHybridClock(deviceId: DeviceId, current: HybridTimestamp | null, now = Date.now(), remote?: HybridTimestamp): HybridTimestamp {
  const localWall = current?.wallTime ?? 0;
  const remoteWall = remote?.wallTime ?? 0;
  const wallTime = Math.max(now, localWall, remoteWall);
  let logical = 0;
  if (wallTime === localWall && wallTime === remoteWall) logical = Math.max(current?.logical ?? 0, remote?.logical ?? 0) + 1;
  else if (wallTime === localWall) logical = (current?.logical ?? 0) + 1;
  else if (wallTime === remoteWall) logical = (remote?.logical ?? 0) + 1;
  return { wallTime, logical, deviceId };
}
