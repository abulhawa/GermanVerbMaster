export const PRACTICE_SETTINGS_OPEN_EVENT = "practice-settings:open";
const PRACTICE_SETTINGS_STORAGE_KEY = "gvm:practice-settings:open";

const isBrowser = () => typeof window !== "undefined";

export function queuePracticeSettingsOpen(): void {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(PRACTICE_SETTINGS_STORAGE_KEY, "1");
}

export function consumeQueuedPracticeSettingsOpen(): boolean {
  if (!isBrowser()) return false;
  const shouldOpen = window.sessionStorage.getItem(PRACTICE_SETTINGS_STORAGE_KEY) === "1";
  if (shouldOpen) {
    window.sessionStorage.removeItem(PRACTICE_SETTINGS_STORAGE_KEY);
  }
  return shouldOpen;
}

export function dispatchPracticeSettingsOpenEvent(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(PRACTICE_SETTINGS_OPEN_EVENT));
}
