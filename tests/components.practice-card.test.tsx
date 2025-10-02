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
});
