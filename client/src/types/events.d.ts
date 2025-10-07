import type { PracticeProgressState, PracticeSettingsState } from "@shared";
import type { TaskAnswerHistoryItem } from "@/lib/answer-history";
import type { ThemeSetting } from "@/lib/theme";

declare global {
  interface PracticeSettingsUpdatedEvent extends CustomEvent<{ state: PracticeSettingsState }> {}
  interface PracticeProgressUpdatedEvent extends CustomEvent<{ state: PracticeProgressState }> {}
  interface AnswerHistoryUpdatedEvent extends CustomEvent<{ history: TaskAnswerHistoryItem[]; updatedAt: string }> {}
  interface ThemePreferenceUpdatedEvent extends CustomEvent<{ theme: ThemeSetting; updatedAt: string }> {}

  interface WindowEventMap {
    "practice-settings:updated": PracticeSettingsUpdatedEvent;
    "practice-progress:updated": PracticeProgressUpdatedEvent;
    "answer-history:updated": AnswerHistoryUpdatedEvent;
    "theme-preference:updated": ThemePreferenceUpdatedEvent;
  }
}

export {};
