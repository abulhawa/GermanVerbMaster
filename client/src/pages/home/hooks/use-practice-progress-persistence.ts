import { useEffect, useState } from 'react';

import { loadPracticeProgress, savePracticeProgress } from '@/lib/practice-progress';
import type { PracticeProgressState } from '@shared';

export function usePracticeProgressPersistence() {
  const [progress, setProgress] = useState<PracticeProgressState>(() => loadPracticeProgress());

  useEffect(() => {
    savePracticeProgress(progress);
  }, [progress]);

  return { progress, setProgress } as const;
}
