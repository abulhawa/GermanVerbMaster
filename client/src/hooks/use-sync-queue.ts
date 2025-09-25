import { useCallback, useEffect } from 'react';
import { flushPendingAttempts } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';

export function useSyncQueue() {
  const queryClient = useQueryClient();

  const flush = useCallback(async () => {
    const flushed = await flushPendingAttempts();
    if (flushed > 0) {
      queryClient.invalidateQueries({ queryKey: ['/api/practice-history'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analytics'] });
    }
  }, [queryClient]);

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
