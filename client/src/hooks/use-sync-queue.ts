import { useCallback, useEffect } from 'react';
import { flushPendingAttempts } from '@/lib/api';

export function useSyncQueue() {
  const flush = useCallback(async () => {
    await flushPendingAttempts();
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
