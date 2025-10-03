import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PracticeCard } from '@/components/practice-card';
import type { PracticeTask } from '@/lib/tasks';
import { clientTaskRegistry } from '@/lib/tasks';
import { createDefaultSettings } from '@/lib/practice-settings';
import type { PracticeSettingsState } from '@shared';
import type { PracticeCardResult } from '@/components/practice-card';

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
    pack: null,
    assignedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    source: 'scheduler',
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
    pack: null,
    assignedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    source: 'scheduler',
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
    pack: null,
    assignedAt: new Date('2024-03-01T00:00:00.000Z').toISOString(),
    source: 'scheduler',
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
    pack: null,
    assignedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    source: 'scheduler',
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

    render(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    const input = screen.getByLabelText(/antwort eingeben/i);
    await userEvent.type(input, 'gegangen');
    await userEvent.click(screen.getByRole('button', { name: /prüfen/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.taskId).toBe(task.taskId);
    expect(payload.result).toBe('correct');
    expect(payload.submittedResponse).toBe('gegangen');

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledTimes(1);
    });

    const result = onResult.mock.calls[0][0];
    expect(result.result).toBe('correct');
    expect(result.submittedResponse).toBe('gegangen');
    expect(result.expectedResponse).toEqual(task.expectedSolution);
  });

  it('displays expected answer on incorrect attempt', async () => {
    vi.mocked(submitPracticeAttempt).mockResolvedValueOnce({ queued: false });

    const onResult = vi.fn();
    const task = createTask();
    const settings = getDefaultSettings();

    render(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    const input = screen.getByLabelText(/antwort eingeben/i);
    await userEvent.type(input, 'geher');
    await userEvent.click(screen.getByRole('button', { name: /prüfen/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getByText(/Erwartete Antwort/i)).toBeInTheDocument();
    });

    const result = onResult.mock.calls[0][0] as PracticeCardResult;
    expect(result.result).toBe('incorrect');
    expect(result.submittedResponse).toBe('geher');
  });

  it('renders noun declension renderer and accepts plural form', async () => {
    const onResult = vi.fn<(result: PracticeCardResult) => void>();
    const task = createNounTask();
    const settings = getDefaultSettings();

    render(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    expect(screen.getByText(/Akkusativ/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/pluralform eingeben/i);
    await userEvent.type(input, 'Häuser');
    await userEvent.click(screen.getByRole('button', { name: /prüfen/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.taskType).toBe('noun_case_declension');

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ result: 'correct' }));
    });
  });

  it('accepts noun answers with definite article combinations', async () => {
    const onResult = vi.fn<(result: PracticeCardResult) => void>();
    const task = createDativeNounTask();
    const settings = getDefaultSettings();

    render(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    const input = screen.getByLabelText(/pluralform eingeben/i);
    await userEvent.type(input, 'den Kindern');
    await userEvent.click(screen.getByRole('button', { name: /prüfen/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.submittedResponse).toBe('den Kindern');
    expect(payload.expectedResponse).toEqual(task.expectedSolution);

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

    render(<PracticeCard task={task} settings={settings} onResult={onResult} />);

    const input = screen.getByLabelText(/adjektivform eingeben/i);
    await userEvent.type(input, 'schneller');
    await userEvent.click(screen.getByRole('button', { name: /prüfen/i }));

    await waitFor(() => {
      expect(submitPracticeAttempt).toHaveBeenCalledTimes(1);
    });

    const payload = vi.mocked(submitPracticeAttempt).mock.calls[0][0];
    expect(payload.taskType).toBe('adj_ending');

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

    render(<PracticeCard task={enrichedTask} settings={settings} onResult={onResult} />);

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

    render(<PracticeCard task={malformedTask} settings={settings} onResult={onResult} />);

    expect(screen.getByText(/CEFR A1/i)).toBeInTheDocument();
  });
});
