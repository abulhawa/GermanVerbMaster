import { motion } from 'framer-motion';
import { CheckCircle2, XCircle } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PracticeCardMessages } from '@/locales';

export interface PracticeStatusBadgeProps {
  copy: PracticeCardMessages;
  status: 'idle' | 'correct' | 'incorrect';
  expectedForms: string[];
  displayAnswer?: string;
  showAnswer: boolean;
}

export function PracticeStatusBadge({
  copy,
  status,
  expectedForms,
  displayAnswer,
  showAnswer,
}: PracticeStatusBadgeProps) {
  const StatusIcon = status === 'correct' ? CheckCircle2 : status === 'incorrect' ? XCircle : null;
  const statusLabel = status === 'correct' ? copy.status.correct : status === 'incorrect' ? copy.status.incorrect : null;

  const hasAnswerToReveal = Boolean(displayAnswer ?? expectedForms[0]);
  const shouldShowAnswer = status === 'incorrect' && hasAnswerToReveal && showAnswer;
  const shouldShowRevealPrompt = status === 'incorrect' && hasAnswerToReveal && !showAnswer;

  if (!StatusIcon || !statusLabel) {
    return null;
  }

  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft backdrop-blur',
        status === 'correct'
          ? 'border-success-border/60 bg-success-muted/80 text-success-foreground'
          : 'border-warning-border/60 bg-warning-muted/80 text-warning-foreground',
      )}
      role="status"
      aria-live="assertive"
    >
      <StatusIcon className="h-5 w-5" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-primary-foreground">{statusLabel}</p>
        {shouldShowAnswer ? (
          <p className="text-xs normal-case text-primary-foreground/80">
            {copy.status.expectedAnswer}{' '}
            <span className="font-medium text-primary-foreground">{displayAnswer ?? expectedForms[0]}</span>
          </p>
        ) : null}
        {shouldShowRevealPrompt ? (
          <p className="text-xs normal-case text-primary-foreground/80">{copy.status.revealPrompt}</p>
        ) : null}
      </div>
    </motion.div>
  );
}
