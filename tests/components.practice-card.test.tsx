import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PracticeCard } from '@/components/practice-card';
import type { PracticeTask } from '@/lib/tasks';
import { clientTaskRegistry } from '@/lib/tasks';
import { createDefaultSettings } from '@/lib/practice-settings';
import type { PracticeSettingsState } from '@shared';
import type { PracticeCardResult } from '@/components/practice-card';
import { LocaleProvider, type Locale } from '@/locales';

vi.mock('@/lib/api', () => ({
  submitPracticeAttempt: vi.fn().mockResolvedValue({ queued: false }),
}));

const { submitPracticeAttempt } = await import('@/lib/api');

function createTask(): PracticeTask<'conjugate_form'> {
  const registry = clientTaskRegistry.conjugate_form;
  return {
    taskId: 'task-1',
    lexemeId: 'lex-1',
    taskType: 'conjugate_form',
    pos: 'verb',
    renderer: registry.renderer,
    prompt: {
      lemma: 'gehen',
      pos: 'verb',
      requestedForm: { tense: 'participle' },
      instructions: 'Gib das Partizip II von „gehen“ an.',
    },
    expectedSolution: { form: 'gegangen', alternateForms: ['ging'] },
    queueCap: registry.defaultQueueCap,
    lexeme: {
      id: 'lex-1',
      lemma: 'gehen',
      metadata: { level: 'A1', english: 'to go' },
    },
    assignedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    source: 'seed',
  } satisfies PracticeTask<'conjugate_form'>;
}

function createNounTask(): PracticeTask<'noun_case_declension'> {
  const registry = clientTaskRegistry.noun_case_declension;
  return {
    taskId: 'noun-task-1',
    lexemeId: 'lex-noun-1',
    taskType: 'noun_case_declension',
    pos: 'noun',
    renderer: registry.renderer,
    prompt: {
      lemma: 'Haus',
      pos: 'noun',
      gender: 'das',
      requestedCase: 'accusative',
      requestedNumber: 'plural',
      instructions: 'Bilde die Akkusativ Plural-Form von „Haus“.',
    },
    expectedSolution: { form: 'Häuser', article: 'die' },
    queueCap: registry.defaultQueueCap,
    lexeme: {
      id: 'lex-noun-1',
      lemma: 'Haus',
      metadata: { level: 'A1', english: 'house' },
    },
    assignedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    source: 'seed',
  } satisfies PracticeTask<'noun_case_declension'>;
}

function createDativeNounTask(): PracticeTask<'noun_case_declension'> {
  const registry = clientTaskRegistry.noun_case_declension;
  return {
    taskId: 'noun-task-dative',
    lexemeId: 'lex-noun-kind',
    taskType: 'noun_case_declension',
    pos: 'noun',
    renderer: registry.renderer,
    prompt: {
      lemma: 'Kind',
      pos: 'noun',
      gender: 'das',
      requestedCase: 'dative',
      requestedNumber: 'plural',
      instructions: 'Setze „Kind“ in den Dativ Plural mit Artikel.',
    },
    expectedSolution: { form: 'Kindern', article: 'den' },
    queueCap: registry.defaultQueueCap,
    lexeme: {
      id: 'lex-noun-kind',
      lemma: 'Kind',
      metadata: { level: 'A2', english: 'child' },
    },
    assignedAt: new Date('2024-03-01T00:00:00.000Z').toISOString(),
    source: 'seed',
  } satisfies PracticeTask<'noun_case_declension'>;
}

function createAdjectiveTask(): PracticeTask<'adj_ending'> {
  const registry = clientTaskRegistry.adj_ending;
  return {
    taskId: 'adj-task-1',
    lexemeId: 'lex-adj-1',
    taskType: 'adj_ending',
    pos: 'adjective',
    renderer: registry.renderer,
    prompt: {
      lemma: 'schnell',
      pos: 'adjective',
      degree: 'comparative',
      instructions: 'Bilde die Komparativform von „schnell“.',
      syntacticFrame: 'Der Zug ist ____ als das Auto.',
    },
    expectedSolution: { form: 'schneller' },
    queueCap: registry.defaultQueueCap,
    lexeme: {
      id: 'lex-adj-1',
      lemma: 'schnell',
      metadata: { level: 'A2', english: 'fast' },
    },
    assignedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    source: 'seed',
  } satisfies PracticeTask<'adj_ending'>;
}

function getDefaultSettings(): PracticeSettingsState {
  return createDefaultSettings();
}

describe('PracticeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        cancel: vi.fn(),
        speak: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
  });

  it('submits correct answers and emits result metadata', async () => {
    const onResult = vi.fn<(result: PracticeCardResult) => void>();
    const task = createTask();
    const settings = getDefaultSettings();

    renderWithLocale(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    expect(
      screen.getByText('What is the Partizip II form of "gehen" (for he/she/it)?'),
    ).toBeInTheDocument();

    const input = screen.getByLabelText(/enter answer/i);
    await userEvent.type(input, 'gegangen');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.taskId).toBe(task.taskId);
    expect(payload.result).toBe('correct');
    expect(payload.submittedResponse).toBe('gegangen');
    expect(payload.promptSummary).toContain('gehen');

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    const result = onResult.mock.calls[0][0];
    expect(result.result).toBe('correct');
    expect(result.submittedResponse).toBe('gegangen');
    expect(result.expectedResponse).toEqual(task.expectedSolution);
  });

  it('localises conjugation instructions when switching locale', () => {
    const task = createTask();
    const settings = getDefaultSettings();

    renderWithLocale(<PracticeCard task={task} settings={settings} onResult={vi.fn()} />, 'de');

    expect(screen.getByText('Konjugiere „gehen“ in der Partizip II-Form.')).toBeInTheDocument();
  });

  it('displays expected answer on incorrect attempt', async () => {
    vi.mocked(submitPracticeAttempt).mockResolvedValueOnce({ queued: false });

    const onResult = vi.fn();
    const task = createTask();
    const settings = getDefaultSettings();

    renderWithLocale(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    const input = screen.getByLabelText(/enter answer/i);
    await userEvent.type(input, 'geher');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/Expected answer/i)).toBeInTheDocument();
    });

    const result = onResult.mock.calls[0][0] as PracticeCardResult;
    expect(result.result).toBe('incorrect');
    expect(result.submittedResponse).toBe('geher');
  });

  it('renders noun declension renderer and accepts plural form', async () => {
    const onResult = vi.fn<(result: PracticeCardResult) => void>();
    const task = createNounTask();
    const settings = getDefaultSettings();

    renderWithLocale(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    expect(screen.getByText('Give the Akkusativ Plural form of "Haus".')).toBeInTheDocument();
    expect(screen.getByText(/Akkusativ/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/enter plural form/i);
    await userEvent.type(input, 'Häuser');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.taskType).toBe('noun_case_declension');
    expect(payload.promptSummary).toContain('Haus');

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ result: 'correct' }));
    });
  });

  it('accepts noun answers with definite article combinations', async () => {
    const onResult = vi.fn<(result: PracticeCardResult) => void>();
    const task = createDativeNounTask();
    const settings = getDefaultSettings();

    renderWithLocale(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    expect(screen.getByText('Give the Dativ Plural form of "Kind".')).toBeInTheDocument();

    const input = screen.getByLabelText(/enter plural form/i);
    await userEvent.type(input, 'den Kindern');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.submittedResponse).toBe('den Kindern');
    expect(payload.expectedResponse).toEqual(task.expectedSolution);
    expect(payload.promptSummary).toContain('Kind');

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(
        expect.objectContaining({ result: 'correct', submittedResponse: 'den Kindern' }),
      );
    });
  });

  it('renders adjective ending renderer and records submissions', async () => {
    const onResult = vi.fn<(result: PracticeCardResult) => void>();
    const task = createAdjectiveTask();
    const settings = getDefaultSettings();

    renderWithLocale(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    expect(screen.getByText('Give the Komparativ form of "schnell".')).toBeInTheDocument();

    const input = screen.getByLabelText(/enter adjective form/i);
    await userEvent.type(input, 'schneller');
    await userEvent.click(screen.getByRole('button', { name: /check/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.taskType).toBe('adj_ending');
    expect(payload.promptSummary).toContain('schnell');

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ result: 'correct' }));
    });
  });

  it('displays the CEFR level from lexeme metadata when provided as a string', () => {
    const onResult = vi.fn();
    const task = createTask();
    const settings = getDefaultSettings();

    const enrichedTask: PracticeTask<'conjugate_form'> = {
      ...task,
      lexeme: {
        ...task.lexeme,
        metadata: { ...task.lexeme.metadata, level: 'B2' },
      },
    };

    renderWithLocale(<PracticeCard task={enrichedTask} settings={settings} onResult={onResult} />);

    expect(screen.getByText(/CEFR B2/i)).toBeInTheDocument();
  });

  it('falls back to the default CEFR level when metadata level is not a string', () => {
    const onResult = vi.fn();
    const task = createTask();
    const settings = getDefaultSettings();

    const malformedTask: PracticeTask<'conjugate_form'> = {
      ...task,
      lexeme: {
        ...task.lexeme,
        metadata: { ...task.lexeme.metadata, level: { code: 'C1' } },
      },
    };

    renderWithLocale(<PracticeCard task={malformedTask} settings={settings} onResult={onResult} />);

    expect(screen.getByText(/CEFR A1/i)).toBeInTheDocument();
  });

  it('renders German copy when the locale is set to de', () => {
    const onResult = vi.fn();
    const task = createTask();
    const settings = getDefaultSettings();

    renderWithLocale(<PracticeCard task={task} settings={settings} onResult={onResult} />, 'de');

    expect(screen.getByText('Konjugiere „gehen“ in der Partizip II-Form.')).toBeInTheDocument();
    expect(screen.getByLabelText(/antwort eingeben/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /prüfen/i })).toBeInTheDocument();
  });
});
function renderWithLocale(ui: React.ReactElement, locale: Locale = 'en') {
  return render(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);
}
