import { useMemo } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { wordSchema } from '../../admin-word-schemas';

interface CreateWordVariables {
  payload: Record<string, unknown>;
}

interface UseCreateWordMutationOptions {
  token: string;
  invalidateKey: QueryKey;
  onError?: (error: unknown) => void;
}

export function useCreateWordMutation({
  token,
  invalidateKey,
  onError,
}: UseCreateWordMutationOptions) {
  const queryClient = useQueryClient();
  const normalizedToken = useMemo(() => token.trim(), [token]);

  return useMutation({
    mutationFn: async ({ payload }: CreateWordVariables) => {
      const response = await fetch('/api/words', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(normalizedToken ? { 'x-admin-token': normalizedToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to create word');
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
