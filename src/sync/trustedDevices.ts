import type { TrustedDeviceRecord } from "./trusted";

const STORAGE_KEY = "opus-pusillium:trusted-devices:v1";

export function listTrustedDevices(): TrustedDeviceRecord[] {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) as TrustedDeviceRecord[] : [];
  } catch { return []; }
}

export function saveTrustedDevice(device: TrustedDeviceRecord) {
  const devices = listTrustedDevices().filter((current) => current.deviceId !== device.deviceId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...devices, device]));
}

export function removeTrustedDevice(deviceId: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(listTrustedDevices().filter((device) => device.deviceId !== deviceId)));
}
