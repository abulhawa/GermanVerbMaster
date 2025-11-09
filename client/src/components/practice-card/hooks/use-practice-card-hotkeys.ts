import { useEffect } from 'react';

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

export interface PracticeCardHotkeyOptions {
  status: 'idle' | 'correct' | 'incorrect';
  onContinue?: () => void;
  onToggleAnswer?: () => void;
  canRevealAnswer?: boolean;
  onRetry?: () => void;
  canRetry?: boolean;
  onPronounce?: () => void;
  canPronounce?: boolean;
  onToggleExample?: () => void;
  canToggleExample?: boolean;
  onSkip?: () => void;
  canSkip?: boolean;
}

export function usePracticeCardHotkeys({
  status,
  onContinue,
  onToggleAnswer,
  canRevealAnswer,
  onRetry,
  canRetry,
  onPronounce,
  canPronounce,
  onToggleExample,
  canToggleExample,
  onSkip,
  canSkip,
}: PracticeCardHotkeyOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target && (target.isContentEditable || (target.tagName && EDITABLE_TAGS.has(target.tagName))),
      );
      const isButtonTarget = Boolean(target?.closest('button, [role="button"]'));

      const key = event.key;

      if (isEditableTarget && key !== 'Escape') {
        return;
      }

      if (status !== 'idle' && onContinue && key === 'ArrowRight') {
        event.preventDefault();
        onContinue();
        return;
      }

      if (status !== 'idle' && canRevealAnswer && onToggleAnswer && key === 'ArrowDown') {
        event.preventDefault();
        onToggleAnswer();
        return;
      }

      if (status === 'incorrect' && canRetry && onRetry && key === 'ArrowLeft') {
        event.preventDefault();
        onRetry();
        return;
      }

      if (
        canPronounce &&
        onPronounce &&
        (key === ' ' || key === 'Spacebar' || key === 'Space')
      ) {
        if (isButtonTarget) {
          return;
        }
        event.preventDefault();
        onPronounce();
        return;
      }

      if (canToggleExample && onToggleExample && key === 'ArrowUp') {
        event.preventDefault();
        onToggleExample();
        return;
      }

      if (status === 'idle' && canSkip && onSkip && key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    status,
    onContinue,
    onToggleAnswer,
    canRevealAnswer,
    onRetry,
    canRetry,
    onPronounce,
    canPronounce,
    onToggleExample,
    canToggleExample,
    onSkip,
    canSkip,
  ]);
}
