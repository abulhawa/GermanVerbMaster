import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import type { Word } from '@shared';

import { wordsResponseSchema } from '../../admin-word-schemas';
import type { AdminWordFilters } from '../constants';

interface UseAdminWordsQueryOptions {
  token: string;
  filters: AdminWordFilters;
}

export function useAdminWordsQuery({ token, filters }: UseAdminWordsQueryOptions) {
  const normalizedToken = token.trim();
  const queryKey = useMemo(
    () => ['admin-words', filters, normalizedToken] as const,
    [filters, normalizedToken],
  );

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ admin: '1' });

      if (filters.pos !== 'ALL') params.set('pos', filters.pos);
      if (filters.level !== 'All') params.set('level', filters.level);
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.approvalFilter === 'approved') params.set('approved', 'true');
      if (filters.approvalFilter === 'pending') params.set('approved', 'false');
      if (filters.completeFilter === 'complete') params.set('complete', 'only');
      if (filters.completeFilter === 'incomplete') params.set('complete', 'non');

      params.set('page', String(filters.page));
      params.set('perPage', String(filters.perPage));

      const headers: Record<string, string> = {};
      if (normalizedToken) {
        headers['x-admin-token'] = normalizedToken;
      }

      const response = await fetch(`/api/words?${params.toString()}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to load words (${response.status})`);
      }

      const payload = await response.json();
      const parsed = wordsResponseSchema.parse(payload);
      return parsed;
    },
  });

  return {
    ...query,
    queryKey,
  };
}

export type AdminWordsQueryData = Awaited<ReturnType<typeof useAdminWordsQuery>['data']>;

export type AdminWord = Word;
