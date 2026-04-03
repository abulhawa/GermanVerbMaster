import { useCallback, useEffect, useState } from 'react';

export function usePronunciationHint(lemma: string, form: string) {
  const [hint, setHint] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setHint(null);
    setIsLoading(false);
  }, [lemma, form]);

  const fetchHint = useCallback(async () => {
    if (hint || isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/pronunciation-hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lemma, form }),
      });

      const data = (await response.json().catch(() => ({ hint: null }))) as { hint?: string | null };
      setHint(typeof data.hint === 'string' && data.hint.trim().length > 0 ? data.hint.trim() : null);
    } catch {
      setHint(null);
    } finally {
      setIsLoading(false);
    }
  }, [form, hint, isLoading, lemma]);

  return { hint, isLoading, fetchHint };
}

