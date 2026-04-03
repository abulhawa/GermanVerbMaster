import { useMemo } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { wordSchema } from '../../admin-word-schemas';

interface EnrichWordVariables {
  id: number;
  overwrite?: boolean;
}

interface UseEnrichWordMutationOptions {
  token: string;
  invalidateKey: QueryKey;
  onError?: (error: unknown) => void;
}

export function useEnrichWordMutation({
  token,
  invalidateKey,
  onError,
}: UseEnrichWordMutationOptions) {
  const queryClient = useQueryClient();
  const normalizedToken = useMemo(() => token.trim(), [token]);

  return useMutation({
    mutationFn: async ({ id, overwrite }: EnrichWordVariables) => {
      const response = await fetch(`/api/words/${id}/enrich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(normalizedToken ? { 'x-admin-token': normalizedToken } : {}),
        },
        body: JSON.stringify({ overwrite }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to enrich word');
      }

      const result = await response.json();
      return wordSchema.parse(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
    },
    onError: (error) => {
      onError?.(error);
    },
  });
}
