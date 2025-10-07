/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import Home from '@/pages/home';
import type { PracticeTask, TaskFetchOptions } from '@/lib/tasks';
import { clientTaskRegistry } from '@/lib/tasks';
import { createDefaultSettings } from '@/lib/practice-settings';
import type { PracticeSettingsState, TaskType } from '@shared';
import { LocaleProvider } from '@/locales';

vi.mock('@/components/settings-dialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/lib/answer-history', async () => {
  const actual = await vi.importActual<typeof import('@/lib/answer-history')>('@/lib/answer-history');
  return {
    ...actual,
    loadAnswerHistory: () => [],
    saveAnswerHistory: () => undefined,
  };
});

vi.mock('@/lib/practice-progress', async () => {
  const actual = await vi.importActual<typeof import('@/lib/practice-progress')>('@/lib/practice-progress');
  return {
    ...actual,
    loadPracticeProgress: actual.createEmptyProgressState,
    savePracticeProgress: () => undefined,
  };
});

vi.mock('@/lib/practice-session', async () => {
  const actual = await vi.importActual<typeof import('@/lib/practice-session')>('@/lib/practice-session');
  return {
    ...actual,
    loadPracticeSession: actual.createEmptySessionState,
    savePracticeSession: () => undefined,
  };
});

vi.mock('@/lib/tasks', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tasks')>('@/lib/tasks');
  return {
    ...actual,
    fetchPracticeTasks: vi.fn(),
  };
});

vi.mock('@/lib/api', () => ({
  submitPracticeAttempt: vi.fn().mockResolvedValue({ queued: false }),
}));

const { fetchPracticeTasks } = await import('@/lib/tasks');
type FetchPracticeTasksMock = Mock<(options?: TaskFetchOptions) => Promise<PracticeTask[]>>;

const mockFetchPracticeTasks = fetchPracticeTasks as unknown as FetchPracticeTasksMock;

const SETTINGS_STORAGE_KEY = 'practice.settings';
const MIGRATION_MARKER_KEY = 'practice.settings.migrated';

const createTaskCounters = (): Record<TaskType, number> => ({
  conjugate_form: 0,
  noun_case_declension: 0,
  adj_ending: 0,
});

let taskTypeCounters = createTaskCounters();

function seedPracticeSettings(
  overrides: Partial<PracticeSettingsState> = {},
): PracticeSettingsState {
  const settings = { ...createDefaultSettings(), ...overrides };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  localStorage.setItem(MIGRATION_MARKER_KEY, '1');
  return settings;
}

function buildTask(taskType: TaskType, index: number): PracticeTask {
  const sequence = taskTypeCounters[taskType]++;
  const baseId = `${taskType}-${sequence}-${index}`;

  switch (taskType) {
    case 'conjugate_form': {
      const entry = clientTaskRegistry.conjugate_form;
      const lemma = `Verb-${sequence}-${index}`;
      return {
        taskId: baseId,
        lexemeId: `lex-${baseId}`,
        taskType,
        pos: 'verb',
        renderer: entry.renderer,
        prompt: {
          lemma,
          pos: 'verb',
          requestedForm: { tense: 'participle' },
          instructions: `Gib das Partizip II von „${lemma}“ an.`,
        },
        expectedSolution: { form: `${lemma}-pp` },
        queueCap: entry.defaultQueueCap,
        lexeme: {
          id: `lex-${baseId}`,
          lemma,
          metadata: { level: 'A1' },
        },
        pack: null,
        assignedAt: new Date().toISOString(),
        source: 'scheduler',
      } satisfies PracticeTask<'conjugate_form'>;
    }
    case 'noun_case_declension': {
      const entry = clientTaskRegistry.noun_case_declension;
      const lemma = `Nomen-${sequence}-${index}`;
      return {
        taskId: baseId,
        lexemeId: `lex-${baseId}`,
        taskType,
        pos: 'noun',
        renderer: entry.renderer,
        prompt: {
          lemma,
          pos: 'noun',
          gender: 'die',
          requestedCase: 'accusative',
          requestedNumber: 'plural',
          instructions: `Bilde die Akkusativ Plural-Form von „${lemma}“.`,
        },
        expectedSolution: { form: `${lemma}e`, article: 'die' },
        queueCap: entry.defaultQueueCap,
        lexeme: {
          id: `lex-${baseId}`,
          lemma,
          metadata: { level: 'A1' },
        },
        pack: null,
        assignedAt: new Date().toISOString(),
        source: 'scheduler',
      } satisfies PracticeTask<'noun_case_declension'>;
    }
    case 'adj_ending': {
      const entry = clientTaskRegistry.adj_ending;
      const lemma = `Adjektiv-${sequence}-${index}`;
      return {
        taskId: baseId,
        lexemeId: `lex-${baseId}`,
        taskType,
        pos: 'adjective',
        renderer: entry.renderer,
        prompt: {
          lemma,
          pos: 'adjective',
          degree: 'comparative',
          instructions: `Bilde die Komparativform von „${lemma}“.`,
          syntacticFrame: `${lemma}e Satzvorlage.`,
        },
        expectedSolution: { form: `${lemma}er` },
        queueCap: entry.defaultQueueCap,
        lexeme: {
          id: `lex-${baseId}`,
          lemma,
          metadata: { level: 'A2' },
        },
        pack: null,
        assignedAt: new Date().toISOString(),
        source: 'scheduler',
      } satisfies PracticeTask<'adj_ending'>;
    }
    default:
      throw new Error(`Unsupported task type: ${taskType}`);
  }
}

function createTask(id: string, lemma: string): PracticeTask<'conjugate_form'> {
  const entry = clientTaskRegistry.conjugate_form;
  return {
    taskId: id,
    lexemeId: `lex-${id}`,
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: entry.renderer,
    prompt: {
      lemma,
      pos: 'verb',
      requestedForm: { tense: 'participle' },
      instructions: `Gib das Partizip II von „${lemma}“ an.`,
    },
    expectedSolution: { form: `${lemma}-pp` },
    queueCap: entry.defaultQueueCap,
    lexeme: {
      id: `lex-${id}`,
      lemma,
      metadata: { level: 'A1' },
    },
    pack: null,
    assignedAt: new Date().toISOString(),
    source: 'scheduler',
  } satisfies PracticeTask<'conjugate_form'>;
}

function renderHome() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <LocaleProvider>
      <QueryClientProvider client={client}>
        <Home />
      </QueryClientProvider>
    </LocaleProvider>,
  );
}

describe('Home navigation controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    taskTypeCounters = createTaskCounters();
    mockFetchPracticeTasks.mockReset();
    mockFetchPracticeTasks.mockResolvedValue([]);
    localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
    Object.defineProperty(window, 'navigator', {
      value: { ...window.navigator, clipboard: { writeText: vi.fn(), readText: vi.fn() } },
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak: vi.fn(),
      },
    });
    class MockSpeechSynthesisUtterance {
      text: string;
      lang: string;
      constructor(text: string) {
        this.text = text;
        this.lang = 'de-DE';
      }
    }
    (globalThis as typeof globalThis & {
      SpeechSynthesisUtterance: typeof MockSpeechSynthesisUtterance;
    }).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance;
  });

  it('advances to the next task when skipping', async () => {
    mockFetchPracticeTasks.mockResolvedValueOnce([createTask('task-1', 'gehen'), createTask('task-2', 'kommen')]);
    mockFetchPracticeTasks.mockResolvedValue([]);

    renderHome();

    const practiceCard = await screen.findByTestId('practice-card');
    expect(within(practiceCard).getByText('gehen')).toBeInTheDocument();

    const skipButton = await screen.findByRole('button', { name: /skip to next/i });
    await userEvent.click(skipButton);

    await waitFor(() => {
      const updatedCard = screen.getByTestId('practice-card');
      expect(within(updatedCard).getByText('kommen')).toBeInTheDocument();
    });
  });

  it('requests tasks for each preferred task type in settings', async () => {
    seedPracticeSettings({
      preferredTaskTypes: ['conjugate_form', 'noun_case_declension'],
      defaultTaskType: 'conjugate_form',
    });

    mockFetchPracticeTasks.mockImplementation(async ({ taskType, limit = 15 }: TaskFetchOptions = {}) => {
      return Array.from({ length: limit }, (_, index) => buildTask(taskType as TaskType, index));
    });

    renderHome();

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'conjugate_form', pos: 'verb', limit: 8 }),
      );
    });

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'noun_case_declension', pos: 'noun', limit: 8 }),
      );
    });
  });

  it('updates preferred task types when selecting a custom mix', async () => {
    seedPracticeSettings();

    mockFetchPracticeTasks.mockImplementation(async ({ taskType, limit = 15 }: TaskFetchOptions = {}) => {
      return Array.from({ length: limit }, (_, index) => buildTask(taskType as TaskType, index));
    });

    renderHome();

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalled();
    });

    mockFetchPracticeTasks.mockClear();

    const customMixButton = await screen.findByRole('button', { name: /configure custom task mix/i });
    await userEvent.click(customMixButton);
    const adjectiveCheckbox = await screen.findByLabelText(/Adjective endings/i);
    await userEvent.click(adjectiveCheckbox);

    await waitFor(() => {
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'conjugate_form', pos: 'verb', limit: 8 }),
      );
      expect(mockFetchPracticeTasks).toHaveBeenCalledWith(
        expect.objectContaining({ taskType: 'adj_ending', pos: 'adjective', limit: 8 }),
      );
    });

    await waitFor(() => {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      expect(stored).toBeTruthy();
      const parsed = stored ? (JSON.parse(stored) as PracticeSettingsState) : null;
      expect(parsed?.preferredTaskTypes).toEqual(['conjugate_form', 'adj_ending']);
      expect(localStorage.getItem(MIGRATION_MARKER_KEY)).toBe('1');
    });
  });

  it('keeps the practice surface full width to prioritise the input experience', async () => {
    mockFetchPracticeTasks.mockResolvedValueOnce([createTask('task-1', 'arbeiten')]);
    mockFetchPracticeTasks.mockResolvedValue([]);

    renderHome();

    const practiceCard = await screen.findByTestId('practice-card');
    expect(within(practiceCard).getByText('arbeiten')).toBeInTheDocument();

    const practiceContainer = await screen.findByTestId('practice-card-container');
    expect(practiceContainer.className).toContain('w-full');
    expect(practiceContainer.className).toContain('xl:max-w-none');
    expect(practiceContainer.className).not.toContain('max-w-2xl');
  });
});
