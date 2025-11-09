import { clientTaskRegistry } from '@/lib/tasks';
import type { PracticeTask, TaskType } from '@/lib/tasks';

const createTaskCounters = (): Record<TaskType, number> => ({
  conjugate_form: 0,
  noun_case_declension: 0,
  adj_ending: 0,
});

let taskTypeCounters = createTaskCounters();

export function resetPracticeTaskFactoryState() {
  taskTypeCounters = createTaskCounters();
}

export function buildPracticeTask<T extends TaskType>(
  taskType: T,
  index: number,
): PracticeTask<T> {
  const entry = clientTaskRegistry[taskType];
  if (!entry) {
    throw new Error(`Unsupported task type: ${taskType}`);
  }

  const sequence = taskTypeCounters[taskType]++;
  const baseId = `${taskType}-${sequence}-${index}`;

  switch (taskType) {
    case 'conjugate_form':
      return {
        taskId: baseId,
        lexemeId: `lex-${baseId}`,
        taskType,
        pos: 'verb',
        renderer: entry.renderer,
        prompt: {
          lemma: `Verb-${sequence}-${index}`,
          pos: 'verb',
          requestedForm: { tense: 'participle' },
          instructions: `Gib das Partizip II von „Verb-${sequence}-${index}“ an.`,
        },
        expectedSolution: { form: `Verb-${sequence}-${index}-pp` },
        queueCap: entry.defaultQueueCap,
        lexeme: {
          id: `lex-${baseId}`,
          lemma: `Verb-${sequence}-${index}`,
          metadata: { level: 'A1' },
        },
        assignedAt: new Date().toISOString(),
        source: 'seed',
      } satisfies PracticeTask<'conjugate_form'> as PracticeTask<T>;
    case 'noun_case_declension':
      return {
        taskId: baseId,
        lexemeId: `lex-${baseId}`,
        taskType,
        pos: 'noun',
        renderer: entry.renderer,
        prompt: {
          lemma: `Nomen-${sequence}-${index}`,
          pos: 'noun',
          gender: 'die',
          requestedCase: 'accusative',
          requestedNumber: 'plural',
          instructions: `Bilde die Akkusativ Plural-Form von „Nomen-${sequence}-${index}“.`,
        },
        expectedSolution: { form: `Nomen-${sequence}-${index}e`, article: 'die' },
        queueCap: entry.defaultQueueCap,
        lexeme: {
          id: `lex-${baseId}`,
          lemma: `Nomen-${sequence}-${index}`,
          metadata: { level: 'A1' },
        },
        assignedAt: new Date().toISOString(),
        source: 'seed',
      } satisfies PracticeTask<'noun_case_declension'> as PracticeTask<T>;
    case 'adj_ending':
      return {
        taskId: baseId,
        lexemeId: `lex-${baseId}`,
        taskType,
        pos: 'adjective',
        renderer: entry.renderer,
        prompt: {
          lemma: `Adjektiv-${sequence}-${index}`,
          pos: 'adjective',
          degree: 'comparative',
          instructions: `Bilde die Komparativform von „Adjektiv-${sequence}-${index}“.`,
          syntacticFrame: `Adjektiv-${sequence}-${index}e Satzvorlage.`,
        },
        expectedSolution: { form: `Adjektiv-${sequence}-${index}er` },
        queueCap: entry.defaultQueueCap,
        lexeme: {
          id: `lex-${baseId}`,
          lemma: `Adjektiv-${sequence}-${index}`,
          metadata: { level: 'A2' },
        },
        assignedAt: new Date().toISOString(),
        source: 'seed',
      } satisfies PracticeTask<'adj_ending'> as PracticeTask<T>;
    default:
      throw new Error(`Unsupported task type: ${taskType}`);
  }
}
