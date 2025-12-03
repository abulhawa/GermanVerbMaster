import { useEffect } from 'react';

export function useAnswerInputFocus(
  status: 'idle' | 'correct' | 'incorrect',
  isSubmitting: boolean,
  inputRef: React.RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    if (status !== 'correct' && !isSubmitting) {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      const length = input.value.length;
      input.focus();
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(length, length);
      } else {
        input.selectionStart = length;
        input.selectionEnd = length;
      }
    }
  }, [status, isSubmitting, inputRef]);
}
