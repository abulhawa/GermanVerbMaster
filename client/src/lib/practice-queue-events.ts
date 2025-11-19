const PRACTICE_QUEUE_REFRESH_EVENT = "practice-queue:refresh";

const isBrowser = () => typeof window !== "undefined";

export { PRACTICE_QUEUE_REFRESH_EVENT };

export function dispatchPracticeQueueRefreshEvent(): void {
  if (!isBrowser()) {
    return;
  }
  window.dispatchEvent(new CustomEvent(PRACTICE_QUEUE_REFRESH_EVENT));
}
