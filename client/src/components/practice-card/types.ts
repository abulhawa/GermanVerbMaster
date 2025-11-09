import type { DebuggableComponentProps } from '@/lib/dev-attributes';
import type { PracticeTask } from '@/lib/tasks';
import type { PracticeSettingsState, PracticeSettingsRendererPreferences, TaskType } from '@shared';
import type { PracticeResult } from '@shared';

export interface PracticeCardResult {
  task: PracticeTask;
  result: PracticeResult;
  submittedResponse: unknown;
  expectedResponse?: unknown;
  promptSummary: string;
  timeSpentMs: number;
  answeredAt: string;
}

export interface PracticeCardSessionProgress {
  completed: number;
  target: number;
}

export interface PracticeCardProps extends DebuggableComponentProps {
  task: PracticeTask;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
  sessionProgress?: PracticeCardSessionProgress;
  onContinue?: () => void;
  onSkip?: () => void;
}

export interface RendererProps<T extends TaskType = TaskType> extends DebuggableComponentProps {
  task: PracticeTask<T>;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
  sessionProgress: PracticeCardSessionProgress;
  onContinue?: () => void;
  onSkip?: () => void;
}

export type { PracticeSettingsRendererPreferences };
export type { TaskType };
