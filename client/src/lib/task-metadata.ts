import type { LexemePos, TaskType } from '@shared';

interface TaskCopy {
  label: string;
  description: string;
  posLabel: string;
  pos: LexemePos;
}

const DEFAULT_COPY: TaskCopy = {
  label: 'Task',
  description: 'Practice task',
  posLabel: 'Task',
  pos: 'verb',
};

export const TASK_TYPE_COPY: Record<TaskType, TaskCopy> = {
  conjugate_form: {
    label: 'Verb conjugation',
    description: 'Strengthen your verb conjugation skills.',
    posLabel: 'Verbs',
    pos: 'verb',
  },
  noun_case_declension: {
    label: 'Noun declension',
    description: 'Build confidence with noun case endings.',
    posLabel: 'Nouns',
    pos: 'noun',
  },
  adj_ending: {
    label: 'Adjective endings',
    description: 'Master comparative adjective endings.',
    posLabel: 'Adjectives',
    pos: 'adjective',
  },
};

export function getTaskTypeCopy(taskType: TaskType): TaskCopy {
  return TASK_TYPE_COPY[taskType] ?? DEFAULT_COPY;
}

export function getTaskTypeLabel(taskType: TaskType): string {
  return getTaskTypeCopy(taskType).label;
}

export function getTaskTypeDescription(taskType: TaskType): string {
  return getTaskTypeCopy(taskType).description;
}

export function getTaskTypePos(taskType: TaskType): LexemePos {
  return getTaskTypeCopy(taskType).pos;
}
