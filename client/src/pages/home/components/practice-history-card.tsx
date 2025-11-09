import { History } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { TaskAnswerHistoryItem } from '@/lib/answer-history';

export interface PracticeHistoryCardMessages {
  title: string;
  summary: string;
  emptySummary: string;
  emptyDetail: string;
  open: string;
  close: string;
  resultLabels: {
    correct: string;
    incorrect: string;
  };
}

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (error) {
    return '';
  }
}

function getResultStyles(result: TaskAnswerHistoryItem['result']) {
  switch (result) {
    case 'correct':
      return 'text-emerald-600 dark:text-emerald-400';
    case 'incorrect':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
}

export interface PracticeHistoryCardProps {
  history: TaskAnswerHistoryItem[];
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  messages: PracticeHistoryCardMessages;
}

export function PracticeHistoryCard({ history, isOpen, onOpenChange, messages }: PracticeHistoryCardProps) {
  const recentHistory = history.slice(0, 5);
  const hasHistory = recentHistory.length > 0;
  const summaryText = messages.summary.replace('{count}', history.length.toString());
  const actionLabel = isOpen ? messages.close : messages.open;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={onOpenChange}
      className="rounded-3xl border border-border/60 bg-card/80 px-4 py-4 shadow-soft"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <History className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-semibold">{messages.title}</p>
            <p className="text-xs text-muted-foreground">
              {hasHistory ? summaryText : messages.emptySummary}
            </p>
          </div>
        </div>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="rounded-full px-3 text-xs font-medium">
            {actionLabel}
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent forceMount className="mt-4 space-y-3">
        {hasHistory ? (
          recentHistory.map((entry) => (
            <div key={entry.id} className="rounded-2xl border border-border/60 bg-background/60 px-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className={cn('font-semibold', getResultStyles(entry.result))}>
                  {entry.result === 'correct'
                    ? messages.resultLabels.correct
                    : messages.resultLabels.incorrect}
                </span>
                <span className="text-muted-foreground">{formatTimestamp(entry.answeredAt)}</span>
              </div>
              <p className="mt-1 text-xs text-foreground/80">{entry.promptSummary}</p>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">{messages.emptyDetail}</p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
