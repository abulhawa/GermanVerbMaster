import { useMemo } from 'react';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';

import { wordSchema } from '../../admin-word-schemas';

interface UpdateWordVariables {
  id: number;
  payload: Record<string, unknown>;
}

interface UseUpdateWordMutationOptions {
  token: string;
  invalidateKey: QueryKey;
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

export function useUpdateWordMutation({ token, invalidateKey, onSuccess, onError }: UseUpdateWordMutationOptions) {
  const queryClient = useQueryClient();
  const normalizedToken = useMemo(() => token.trim(), [token]);

  return useMutation({
    mutationFn: async ({ id, payload }: UpdateWordVariables) => {
      const response = await fetch(`/api/words/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(normalizedToken ? { 'x-admin-token': normalizedToken } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update word');
      }

      const result = await response.json();
      return wordSchema.parse(result);
    },
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: invalidateKey });
      onSuccess?.();
    },
    onError: (error, variables, context) => {
      onError?.(error);
    },
  });
}

export type UpdateWordMutation = ReturnType<typeof useUpdateWordMutation>;
