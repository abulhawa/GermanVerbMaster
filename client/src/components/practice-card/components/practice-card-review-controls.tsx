import { Button } from '@/components/ui/button';
import type { PracticeCardMessages } from '@/locales';

import { ActionButtonContent, formatShortcutKey } from './action-button-content';

export interface PracticeCardReviewControlsProps {
  copy: PracticeCardMessages;
  status: 'idle' | 'correct' | 'incorrect';
  canRevealAnswer: boolean;
  isAnswerRevealed: boolean;
  onToggleAnswer: () => void;
  onContinue?: () => void;
}

export function PracticeCardReviewControls({
  copy,
  status,
  canRevealAnswer,
  isAnswerRevealed,
  onToggleAnswer,
  onContinue,
}: PracticeCardReviewControlsProps) {
  if (status === 'idle') {
    return null;
  }

  const revealLabel = isAnswerRevealed ? copy.actions.hideAnswer : copy.actions.revealAnswer;
  const revealHint = formatShortcutKey('ArrowDown');
  const nextHint = formatShortcutKey('ArrowRight');

  return (
    <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
      {canRevealAnswer ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full max-w-[min(60vw,20rem)]"
          onClick={onToggleAnswer}
          aria-keyshortcuts="ArrowDown"
        >
          <ActionButtonContent label={revealLabel} hint={revealHint} />
        </Button>
      ) : null}
      {onContinue ? (
        <Button
          type="button"
          size="lg"
          className="w-full max-w-[min(60vw,20rem)]"
          onClick={onContinue}
          aria-keyshortcuts="ArrowRight"
        >
          <ActionButtonContent label={copy.actions.nextQuestion} hint={nextHint} />
        </Button>
      ) : null}
    </div>
  );
}
