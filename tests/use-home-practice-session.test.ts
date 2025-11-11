import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useHomePracticeSession } from '@/pages/home/use-practice-session';
import type { PracticeCardResult } from '@/components/practice-card';
import type { PracticeTask } from '@/lib/tasks';

interface RawTaskPayload {
  taskId: string;
  taskType: 'conjugate_form';
  renderer: 'conjugate_form';
  pos: 'verb';
  prompt: {
    lemma: string;
    pos: 'verb';
    requestedForm: {
      tense: 'present';
      person: number;
      number: 'singular' | 'plural';
    };
    instructions: string;
  };
  solution: {
    form: string;
  };
  queueCap: number;
  lexeme: {
    id: string;
    lemma: string;
    metadata: Record<string, unknown>;
  };
}

function createRawTask(index: number): RawTaskPayload {
  return {
    taskId: `task-${index}`,
    taskType: 'conjugate_form',
    renderer: 'conjugate_form',
    pos: 'verb',
    prompt: {
      lemma: `verb-${index}`,
      pos: 'verb',
      requestedForm: {
        tense: 'present',
        person: 1,
        number: 'singular',
      },
      instructions: `Conjugate verb-${index}`,
    },
    solution: {
      form: `form-${index}`,
    },
    queueCap: 30,
    lexeme: {
      id: `lex-${index}`,
      lemma: `verb-${index}`,
      metadata: { level: 'A1' },
    },
  } satisfies RawTaskPayload;
}

function createJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('useHomePracticeSession', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('fetches a new queue once all tasks have been interacted with', async () => {
    const initialTasks = Array.from({ length: 6 }, (_, index) => createRawTask(index + 1));
    const nextTasks = Array.from({ length: 3 }, (_, index) => createRawTask(index + 101));

    let fetchCall = 0;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const payload =
        fetchCall === 0
          ? { tasksByType: { conjugate_form: initialTasks } }
          : { tasksByType: { conjugate_form: nextTasks } };
      fetchCall += 1;
      return Promise.resolve(createJsonResponse(payload));
    });

    const { result } = renderHook(() =>
      useHomePracticeSession({
        activeTaskTypes: ['conjugate_form'],
        sessionScopeKey: 'spec-scope',
        userId: 'user-1',
        resolveLevelForPos: () => 'A1',
      }),
    );

    await waitFor(() => {
      expect(result.current.activeTask).toBeDefined();
    });

    const maxIterations = 30;
    let allTasksSeen = false;

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      await waitFor(() => result.current.activeTask);
      const active = result.current.activeTask as PracticeTask | undefined;
      expect(active).toBeDefined();
      if (!active) {
        break;
      }

      act(() => {
        const attempt: PracticeCardResult = {
          task: active,
          result: 'correct',
          submittedResponse: null,
          expectedResponse: active.expectedSolution,
          promptSummary: `Answered ${active.taskId}`,
          timeSpentMs: 500,
          answeredAt: new Date().toISOString(),
        };
        result.current.registerPendingResult(attempt);
      });

      act(() => {
        result.current.continueToNext();
      });

      await waitFor(() => result.current.activeTask?.taskId !== active.taskId);

      const leitner = result.current.session.leitner;
      if (leitner && leitner.totalUnique > 0 && leitner.seenUnique >= leitner.totalUnique) {
        allTasksSeen = true;
        break;
      }
    }

    expect(allTasksSeen).toBe(true);

    await waitFor(() => {
      const queue = result.current.session.queue;
      const queueSet = new Set(queue);
      for (const task of nextTasks) {
        expect(queueSet.has(task.taskId)).toBe(true);
      }
      for (const task of initialTasks) {
        expect(queueSet.has(task.taskId)).toBe(false);
      }
      expect(result.current.session.leitner?.seenUnique ?? 0).toBe(0);
      expect(fetchMock).toHaveBeenCalled();
    });
  });
});
