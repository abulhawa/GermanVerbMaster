import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clientTaskRegistry,
  fetchPracticeTasks,
  fetchPracticeTasksByType,
  getClientTaskRegistryEntry,
  listClientTaskTypes,
} from '@/lib/tasks';
import { taskTypeRegistry } from '@shared/task-registry';

const conjugatePrompt = {
  lemma: 'sein',
  pos: 'verb',
  requestedForm: {
    tense: 'present',
    person: 1,
    number: 'singular',
  },
  instructions: 'Konjugiere „sein" in der 1. Person Singular Präsens.',
} as const;

const conjugateSolution = {
  form: 'bin',
  alternateForms: ['bin ich'],
} as const;

function requestToUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  if (input instanceof URL) {
    return input.toString();
  }
  return (input as Request).url;
}

describe('fetchPracticeTasks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns tasks validated against the shared registry', async () => {
    const payload = {
      tasks: [
        {
          taskId: 'task-1',
          taskType: 'conjugate_form',
          renderer: 'conjugate_form',
          pos: 'verb',
          prompt: conjugatePrompt,
          solution: conjugateSolution,
          queueCap: 30,
          lexeme: {
            id: 'lex-1',
            lemma: 'sein',
            metadata: { english: 'to be' },
          },
        },
      ],
    } satisfies Record<string, unknown>;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestToUrl(input);
      if (url.includes('/api/tasks')) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const tasks = await fetchPracticeTasks({ pos: 'verb', taskType: 'conjugate_form', limit: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(tasks).toHaveLength(1);

    const [task] = tasks;
    expect(task.taskId).toBe('task-1');
    expect(task.prompt.lemma).toBe('sein');
    expect(task.expectedSolution?.form).toBe('bin');
    expect(task.source).toBe('seed');
  });

  it('attaches the device identifier to task feed requests', async () => {
    const payload = {
      tasks: [],
    } satisfies Record<string, unknown>;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestToUrl(input);
      if (url.includes('/api/tasks')) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    await fetchPracticeTasks({ pos: 'verb', taskType: 'conjugate_form', limit: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(requestToUrl(fetchMock.mock.calls[0]![0]!));
    expect(url.searchParams.get('deviceId')).toMatch(/\w+/);
  });

  it('throws an error when the task feed request fails', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestToUrl(input);
      if (url.includes('/api/tasks')) {
        return new Response('Server error', { status: 502, statusText: 'Bad Gateway' });
      }
      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPracticeTasks({ pos: 'verb', limit: 1 })).rejects.toThrow('Task feed responded with status 502');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('fetchPracticeTasksByType', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('requests multiple task types in a single fetch and groups the response', async () => {
    const payload = {
      tasksByType: {
        conjugate_form: [
          {
            taskId: 'task-1',
            taskType: 'conjugate_form',
            renderer: 'conjugate_form',
            pos: 'verb',
            prompt: conjugatePrompt,
            solution: conjugateSolution,
            queueCap: 30,
            lexeme: { id: 'lex-1', lemma: 'sein', metadata: { english: 'to be' } },
          },
        ],
        noun_case_declension: [
          {
            taskId: 'task-2',
            taskType: 'noun_case_declension',
            renderer: 'noun_case_declension',
            pos: 'noun',
            prompt: {
              lemma: 'Haus',
              pos: 'noun',
              gender: 'das',
              requestedCase: 'nominative',
              requestedNumber: 'singular',
              instructions: 'Bestimme den Nominativ Singular für „Haus“. ',
            },
            solution: { form: 'das Haus', article: 'das' },
            queueCap: 25,
            lexeme: { id: 'lex-2', lemma: 'Haus', metadata: null },
          },
        ],
      },
    } satisfies Record<string, unknown>;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestToUrl(input);
      if (url.includes('/api/tasks')) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchPracticeTasksByType({
      taskTypes: ['conjugate_form', 'noun_case_declension'],
      limit: 5,
      level: ['A1', 'A2'],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(requestToUrl(fetchMock.mock.calls[0]![0]!));
    expect(url.searchParams.getAll('taskTypes')).toEqual(['conjugate_form', 'noun_case_declension']);
    expect(url.searchParams.getAll('level')).toEqual(['A1', 'A2']);
    expect(url.searchParams.get('limit')).toBe('5');

    expect(result.conjugate_form).toHaveLength(1);
    expect(result.noun_case_declension).toHaveLength(1);
    expect(result.conjugate_form[0]!.taskId).toBe('task-1');
    expect(result.noun_case_declension[0]!.taskId).toBe('task-2');
  });
});

describe('client task registry parity', () => {
  it('matches the shared task registry entries', () => {
    expect(clientTaskRegistry).toEqual(taskTypeRegistry);
  });

  it('lists the same task types as the shared registry', () => {
    const clientTypes = listClientTaskTypes().sort();
    const sharedTypes = Object.keys(taskTypeRegistry).sort();
    expect(clientTypes).toEqual(sharedTypes);
  });

  it('returns shared registry references for known task types', () => {
    expect(getClientTaskRegistryEntry('conjugate_form')).toBe(taskTypeRegistry.conjugate_form);
  });

  it('throws when requesting an unknown task type', () => {
    expect(() => getClientTaskRegistryEntry('unknown' as never)).toThrowError(/Unknown task type/);
  });
});
