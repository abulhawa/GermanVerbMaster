import {
  taskTypeRegistry as sharedRegistry,
  type TaskType,
  type TaskRegistryEntry,
} from '@shared/task-registry';

export interface ServerTaskRegistryEntry extends TaskRegistryEntry {
  queueCap: number;
  evaluation: {
    strategy: 'string-equality';
    normalise: boolean;
  };
}

export const taskRegistry: Record<TaskType, ServerTaskRegistryEntry> = {
  conjugate_form: {
    ...sharedRegistry.conjugate_form,
    queueCap: 30,
    evaluation: {
      strategy: 'string-equality',
      normalise: true,
    },
  },
  noun_case_declension: {
    ...sharedRegistry.noun_case_declension,
    queueCap: 25,
    evaluation: {
      strategy: 'string-equality',
      normalise: true,
    },
  },
  adj_ending: {
    ...sharedRegistry.adj_ending,
    queueCap: 20,
    evaluation: {
      strategy: 'string-equality',
      normalise: true,
    },
  },
};

export function getTaskRegistryEntry(taskType: TaskType): ServerTaskRegistryEntry {
  const entry = taskRegistry[taskType];
  if (!entry) {
    throw new Error(`Unknown task type: ${taskType}`);
  }
  return entry;
}

export function listTaskTypes(): TaskType[] {
  return Object.keys(taskRegistry) as TaskType[];
}
