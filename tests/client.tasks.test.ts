import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetLegacyEndpointTelemetryForTests,
  clientTaskRegistry,
  createLegacyConjugationTask,
  fetchPracticeTasks,
  getClientTaskRegistryEntry,
  getLastLegacyEndpointNotice,
  listClientTaskTypes,
} from '@/lib/tasks';
import { taskTypeRegistry } from '@shared/task-registry';
import type { GermanVerb } from '@shared';

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
  beforeEach(() => {
    __resetLegacyEndpointTelemetryForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns tasks validated against the shared registry', async () => {
    const payload = {
      tasks: [
        {
          id: 'task-1',
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
          pack: {
            id: 'pack-1',
            slug: 'verbs-foundation',
            name: 'Verbs Foundation',
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
    expect(task.pack?.slug).toBe('verbs-foundation');
    expect(task.source).toBe('scheduler');
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

  it('falls back to the legacy verb feed and records telemetry when the task feed fails', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestToUrl(input);
      if (url.includes('/api/tasks')) {
        return new Response('Server error', { status: 500 });
      }
      if (url.includes('/api/quiz/verbs')) {
        const verbs = [
          {
            infinitive: 'gehen',
            english: 'to go',
            präteritum: 'ging',
            partizipII: 'gegangen',
            auxiliary: 'sein',
            level: 'A1',
            präteritumExample: 'ich ging',
            partizipIIExample: 'ich bin gegangen',
            source: {
              name: 'Duden',
              levelReference: 'A1',
            },
            pattern: null,
            praesensIch: 'gehe',
            praesensEr: 'geht',
            perfekt: 'ist gegangen',
            separable: null,
          },
        ];
        return new Response(JSON.stringify(verbs), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            Deprecation: 'Wed, 01 Oct 2025 00:00:00 GMT',
            Warning: '299 - "Legacy verb endpoint"',
            Link: '</api/tasks>; rel="successor-version"',
          },
        });
      }
      throw new Error(`Unexpected request: ${input}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const tasks = await fetchPracticeTasks({ pos: 'verb', limit: 1 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].taskType).toBe('conjugate_form');
    expect(tasks[0].source).toBe('seed');
    expect(tasks[0].expectedSolution?.form).toBe('gegangen');

    const telemetry = getLastLegacyEndpointNotice();
    expect(telemetry?.warningHeader).toContain('Legacy verb endpoint');
    expect(telemetry?.reason).toContain('status 500');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(debugSpy).not.toHaveBeenCalled();
  });

  it('produces verb preset tasks identical to the legacy conjugation helper when falling back', async () => {
    vi.useFakeTimers();
    const fixedNow = new Date('2024-03-01T12:34:56.000Z');
    vi.setSystemTime(fixedNow);

    try {
      const legacyVerbPayload = {
        infinitive: 'laufen',
        english: 'to run',
        präteritum: 'lief',
        partizipII: 'gelaufen',
        auxiliary: 'sein',
        level: 'A2',
        präteritumExample: 'ich lief',
        partizipIIExample: 'ich bin gelaufen',
        source: {
          name: 'Duden',
          levelReference: 'A2',
        },
        pattern: null,
        praesensIch: 'laufe',
        praesensEr: 'läuft',
        perfekt: 'ist gelaufen',
        separable: false,
      } satisfies Record<string, unknown>;

      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = requestToUrl(input);
        if (url.includes('/api/tasks')) {
          return new Response('Server error', { status: 502 });
        }
        if (url.includes('/api/quiz/verbs')) {
          return new Response(JSON.stringify([legacyVerbPayload]), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              Warning: '299 - "Legacy verb endpoint"',
            },
          });
        }
        throw new Error(`Unexpected request: ${input}`);
      });

      vi.stubGlobal('fetch', fetchMock);

      const tasks = await fetchPracticeTasks({ pos: 'verb', taskType: 'conjugate_form', limit: 1 });

      expect(tasks).toHaveLength(1);

      const expectedVerb: GermanVerb = {
        infinitive: 'laufen',
        english: 'to run',
        präteritum: 'lief',
        partizipII: 'gelaufen',
        auxiliary: 'sein',
        level: 'A2',
        präteritumExample: 'ich lief',
        partizipIIExample: 'ich bin gelaufen',
        source: {
          name: 'Duden',
          levelReference: 'A2',
        },
        pattern: null,
        praesensIch: 'laufe',
        praesensEr: 'läuft',
        perfekt: 'ist gelaufen',
        separable: false,
      };

      const expectedTask = createLegacyConjugationTask(expectedVerb);
      expect(tasks[0]).toEqual(expectedTask);
    } finally {
      vi.useRealTimers();
    }
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
