/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/pages/home';
import type { PracticeTask } from '@/lib/tasks';
import { clientTaskRegistry } from '@/lib/tasks';

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
const mockFetchPracticeTasks = fetchPracticeTasks as unknown as vi.Mock;

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
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  );
}

describe('Home navigation controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
  });

  it('advances to the next task when skipping', async () => {
    mockFetchPracticeTasks.mockResolvedValueOnce([createTask('task-1', 'gehen'), createTask('task-2', 'kommen')]);
    mockFetchPracticeTasks.mockResolvedValue([]);

    renderHome();

    const initialHeading = await screen.findByRole('heading', { name: 'gehen' });
    expect(initialHeading).toBeInTheDocument();

    const skipButton = await screen.findByRole('button', { name: /skip to next/i });
    await userEvent.click(skipButton);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'kommen' })).toBeInTheDocument();
    });
  });
});
