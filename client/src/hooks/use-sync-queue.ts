import { useCallback, useEffect } from 'react';
import { flushPendingAttempts } from '@/lib/api';

export function useSyncQueue() {
  const flush = useCallback(async () => {
    const result = await flushPendingAttempts();

    if (result.failed > 0 || result.deferred > 0) {
      console.info('Pending attempts remain after sync', result);
    }
  }, []);

  useEffect(() => {
    void flush();

    const handleOnline = () => {
      void flush();
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void flush();
      }
    };

    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flush]);
}
