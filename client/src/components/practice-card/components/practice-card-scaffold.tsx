import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import { getDevAttributes } from '@/lib/dev-attributes';
import type { PracticeCardMessages } from '@/locales';

import type { PracticeCardSessionProgress } from '../types';
import { formatInstructionTemplate } from '../utils/format';

export interface PracticeCardScaffoldProps {
  copy: PracticeCardMessages;
  sessionProgress: PracticeCardSessionProgress;
  prompt: ReactNode;
  answerSection: ReactNode;
  statusBadge?: ReactNode;
  supportSections?: ReactNode[];
  className?: string;
  isLoadingNext?: boolean;
  badgeLabel?: string;
  debugId?: string;
}

export function PracticeCardScaffold({
  copy,
  sessionProgress,
  prompt,
  answerSection,
  statusBadge,
  supportSections = [],
  className,
  debugId,
  isLoadingNext,
  badgeLabel,
}: PracticeCardScaffoldProps) {
  const completedLabel = formatInstructionTemplate(copy.progress.completedLabel, {
    count: String(Math.max(sessionProgress.completed, 0)),
  });
  const supplementarySections = supportSections.filter(Boolean);
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'practice-card';
  const resolvedBadgeLabel = badgeLabel && badgeLabel.trim().length > 0 ? badgeLabel : copy.header.appName;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[32px] border border-primary/30 bg-gradient-to-b from-brand-gradient-start via-primary/80 to-brand-gradient-end text-primary-foreground shadow-2xl shadow-primary/25',
        className,
      )}
      data-testid="practice-card"
      {...getDevAttributes('practice-card', resolvedDebugId)}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-gradient-start via-primary/85 to-brand-gradient-end"
        aria-hidden
      />
      <div className="relative flex w-full flex-col gap-8 px-6 py-8 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-card/25 backdrop-blur-md" aria-hidden />
        <div className="relative flex w-full flex-col items-center gap-8 text-center">
          <header className="flex w-full flex-wrap items-center justify-between gap-4 text-left">
            <span
              className="inline-flex items-center rounded-full bg-card/30 px-5 py-2 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground/90"
              aria-label={copy.header.appName}
            >
              {resolvedBadgeLabel}
            </span>
          </header>
          <div className="flex w-full flex-col items-center gap-4 text-center">{prompt}</div>
          {statusBadge ? <div className="flex w-full justify-center">{statusBadge}</div> : null}
          <div className="w-full">{answerSection}</div>
          {supplementarySections.length > 0 ? <div className="w-full space-y-3">{supplementarySections}</div> : null}
          <footer className="flex w-full flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary-foreground/80 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-primary-foreground/70">{completedLabel}</span>
          </footer>
        </div>
      </div>
      {isLoadingNext ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-[32px] bg-background/70 backdrop-blur">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <span className="sr-only">{copy.loadingNext}</span>
        </div>
      ) : null}
    </div>
  );
}
