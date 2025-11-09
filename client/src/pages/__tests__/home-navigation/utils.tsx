import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { vi, type Mock } from 'vitest';

import Home from '@/pages/home';
import type { PracticeTask, MultiTaskFetchOptions } from '@/lib/tasks';
import { createDefaultSettings } from '@/lib/practice-settings';
import type { PracticeSettingsState, TaskType } from '@shared';
import { LocaleProvider } from '@/locales';
import { PracticeSettingsProvider } from '@/contexts/practice-settings-context';
import {
  buildPracticeTask as sharedBuildPracticeTask,
  resetPracticeTaskFactoryState,
} from '../practice-task-factory';

vi.mock('@/components/settings-dialog', () => ({
  SettingsDialog: () => null,
}));

vi.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AvatarFallback: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    fetchPracticeTasksByType: vi.fn(),
  };
});

vi.mock('@/lib/api', () => ({
  submitPracticeAttempt: vi.fn().mockResolvedValue({ queued: false }),
}));

const { fetchPracticeTasksByType, clientTaskRegistry } = await import('@/lib/tasks');

export type FetchPracticeTasksMock = Mock<
  (options: MultiTaskFetchOptions) => Promise<Record<TaskType, PracticeTask[]>>
>;

export const mockFetchPracticeTasks =
  fetchPracticeTasksByType as unknown as FetchPracticeTasksMock;

export const SETTINGS_STORAGE_KEY = 'practice.settings';
export const MIGRATION_MARKER_KEY = 'practice.settings.migrated';

function stubMatchMedia() {
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
}

function stubPointerEvents() {
  Object.defineProperty(Element.prototype, 'hasPointerCapture', {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(Element.prototype, 'releasePointerCapture', {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
}

function stubNavigatorClipboard() {
  Object.defineProperty(window, 'navigator', {
    value: { ...window.navigator, clipboard: { writeText: vi.fn(), readText: vi.fn() } },
    configurable: true,
  });
}

function stubSpeechSynthesis() {
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
  }).SpeechSynthesisUtterance =
    MockSpeechSynthesisUtterance as unknown as typeof SpeechSynthesisUtterance;
}

export function buildPracticeTask<T extends TaskType>(taskType: T, index: number) {
  return sharedBuildPracticeTask(taskType, index);
}

export { resetPracticeTaskFactoryState };

function prepareMocks() {
  vi.clearAllMocks();
  resetPracticeTaskFactoryState();
  mockFetchPracticeTasks.mockReset();
  mockFetchPracticeTasks.mockResolvedValue({});
  localStorage.clear();
  stubMatchMedia();
  stubPointerEvents();
  stubNavigatorClipboard();
  stubSpeechSynthesis();
}

export function setupHomeNavigationTest() {
  prepareMocks();
}

export function seedPracticeSettings(
  overrides: Partial<PracticeSettingsState> = {},
): PracticeSettingsState {
  const settings = { ...createDefaultSettings(), ...overrides };
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  localStorage.setItem(MIGRATION_MARKER_KEY, '1');
  return settings;
}

export function renderHome(): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <LocaleProvider>
      <QueryClientProvider client={client}>
        <PracticeSettingsProvider>
          <Home />
        </PracticeSettingsProvider>
      </QueryClientProvider>
    </LocaleProvider>,
  );
}


export function createConjugationTask(
  id: string,
  lemma: string,
): PracticeTask<'conjugate_form'> {
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
    assignedAt: new Date().toISOString(),
    source: 'seed',
  } satisfies PracticeTask<'conjugate_form'>;
}
