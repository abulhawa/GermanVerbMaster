import type { CEFRLevel } from "@shared";
import type { AnsweredQuestion } from "@/lib/answer-history";

export type LevelFilter = CEFRLevel | "all";
export type ResultFilter = "all" | "correct" | "incorrect";

export const LEVEL_FILTERS: LevelFilter[] = ["all", "A1", "A2", "B1", "B2", "C1", "C2"];
export const RESULT_FILTERS: ResultFilter[] = ["all", "correct", "incorrect"];

export const ANSWER_HISTORY_IDS = {
  page: "answer-history-page",
  content: "answer-history-content",
  headerSection: "answer-history-header",
  statsSection: "answer-history-stats",
  filtersSection: "answer-history-filters",
  loadErrorAlert: "answer-history-load-error",
  skeletonSection: "answer-history-skeleton",
  panelSection: "answer-history-panel",
  backButton: "answer-history-back-button",
  clearButton: "answer-history-clear-button",
  retryButton: "answer-history-retry-button",
} as const;

export const DEFAULT_PAGE_SIZE = 25;

export function mergeAnswerLists(
  primary: AnsweredQuestion[],
  secondary: AnsweredQuestion[],
): AnsweredQuestion[] {
  const seen = new Set<string>();
  const combined: AnsweredQuestion[] = [];

  for (const entry of [...primary, ...secondary]) {
    if (!entry || typeof entry.id !== "string") {
      continue;
    }

    if (seen.has(entry.id)) {
      continue;
    }

    seen.add(entry.id);
    combined.push(entry);
  }

  return combined.sort((a, b) => {
    const aTime = Date.parse(a.answeredAt ?? "");
    const bTime = Date.parse(b.answeredAt ?? "");

    if (Number.isFinite(aTime) && Number.isFinite(bTime)) {
      return bTime - aTime;
    }

    if (Number.isFinite(bTime)) {
      return 1;
    }

    if (Number.isFinite(aTime)) {
      return -1;
    }

    return 0;
  });
}

export function formatAverageDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "—";
  }

  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));

  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}
