import { nanoid } from 'nanoid';

const STORAGE_KEY = 'germanVerbMaster.deviceId';

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : nanoid();
  }

  let deviceId = localStorage.getItem(STORAGE_KEY);
  if (!deviceId) {
    deviceId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : nanoid();
    try {
      localStorage.setItem(STORAGE_KEY, deviceId);
    } catch (error) {
      console.warn('Unable to persist deviceId to localStorage', error);
    }
  }
  return deviceId;
}
