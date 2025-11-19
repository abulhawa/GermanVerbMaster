const PRACTICE_QUEUE_REFRESH_EVENT = "practice-queue:refresh";

const isBrowser = () => typeof window !== "undefined";

export type PracticeQueueRefreshMode = "default" | "shuffle";

export interface PracticeQueueRefreshEventDetail {
  mode?: PracticeQueueRefreshMode;
}

export { PRACTICE_QUEUE_REFRESH_EVENT };

export function dispatchPracticeQueueRefreshEvent(
  detail: PracticeQueueRefreshEventDetail = {},
): void {
  if (!isBrowser()) {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<PracticeQueueRefreshEventDetail>(PRACTICE_QUEUE_REFRESH_EVENT, {
      detail,
    }),
  );
}
