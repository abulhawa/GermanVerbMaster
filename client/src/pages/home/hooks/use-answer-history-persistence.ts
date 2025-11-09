import { useEffect, useState } from 'react';

import { loadAnswerHistory, saveAnswerHistory } from '@/lib/answer-history';
import type { TaskAnswerHistoryItem } from '@/lib/answer-history';

export function useAnswerHistoryPersistence() {
  const [answerHistory, setAnswerHistory] = useState<TaskAnswerHistoryItem[]>(() => loadAnswerHistory());

  useEffect(() => {
    saveAnswerHistory(answerHistory);
  }, [answerHistory]);

  return { answerHistory, setAnswerHistory } as const;
}
