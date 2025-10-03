import { motion } from 'framer-motion';
import { Trophy, Flame, BookOpen, Loader2 } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress as ProgressBar } from '@/components/ui/progress';
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from '@/lib/dev-attributes';
import type { PracticeProgressState, TaskType, CEFRLevel } from '@shared';

interface ProgressDisplayProps extends DebuggableComponentProps {
  progress: PracticeProgressState;
  taskType: TaskType;
  taskTypes?: TaskType[];
  taskLabel?: string;
  cefrLevel?: CEFRLevel;
  cefrLabel?: string;
  headline?: string;
  isLoading?: boolean;
}

function getSummary(progress: PracticeProgressState, taskTypes: TaskType[]) {
  const lexemeIds = new Set<string>();
  let correct = 0;
  let incorrect = 0;
  let streak = 0;
  let lastPracticedAt: string | null = null;

  for (const taskType of taskTypes) {
    const summary = progress.totals[taskType];
    if (!summary) {
      continue;
    }
    correct += summary.correctAttempts;
    incorrect += summary.incorrectAttempts;
    streak = Math.max(streak, summary.streak);
    if (summary.lastPracticedAt) {
      if (!lastPracticedAt || new Date(summary.lastPracticedAt) > new Date(lastPracticedAt)) {
        lastPracticedAt = summary.lastPracticedAt;
      }
    }
    for (const lexemeId of Object.keys(summary.lexemes)) {
      lexemeIds.add(lexemeId);
    }
  }

  const total = correct + incorrect;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  return {
    correct,
    incorrect,
    total,
    accuracy,
    streak,
    lastPracticedAt,
    uniqueLexemes: lexemeIds.size,
  };
}

export function ProgressDisplay({
  progress,
  taskType,
  taskTypes,
  taskLabel,
  cefrLevel,
  cefrLabel,
  headline = 'Progress overview',
  isLoading = false,
  debugId,
}: ProgressDisplayProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'progress-overview';

  if (isLoading) {
    return (
      <Card
        debugId={`${resolvedDebugId}-loading-card`}
        className="rounded-3xl border border-border/60 bg-card/85"
      >
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  const resolvedTaskTypes = taskTypes && taskTypes.length ? taskTypes : [taskType];
  const summary = getSummary(progress, resolvedTaskTypes);
  const descriptor =
    taskLabel ??
    (resolvedTaskTypes.length > 1
      ? `Task mix (${resolvedTaskTypes.length} types)`
      : `Task type ${resolvedTaskTypes[0]}`);
  const lastPracticed = summary.lastPracticedAt
    ? new Date(summary.lastPracticedAt).toLocaleDateString()
    : 'Noch kein Eintrag';
  const cefrDisplay = cefrLabel ?? (cefrLevel ? `Level ${cefrLevel}` : undefined);

  return (
    <Card
      debugId={`${resolvedDebugId}-card`}
      className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
      {...getDevAttributes('progress-overview-card', resolvedDebugId)}
    >
      <CardHeader className="space-y-4 pb-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-foreground">{headline}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Fortschritt für{' '}
              <span className="font-semibold text-foreground">{descriptor}</span>
              {cefrDisplay ? ` · ${cefrDisplay}` : ''}.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="flex items-center gap-2 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-secondary"
          >
            <Flame className="h-4 w-4" aria-hidden />
            {summary.streak} day{summary.streak === 1 ? '' : 's'} streak
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 text-muted-foreground">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Accuracy
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{summary.accuracy}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Basierend auf {summary.total} Versuch{summary.total === 1 ? '' : 'en'}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Lexemes practiced
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{summary.uniqueLexemes}</p>
            <p className="mt-1 text-xs text-muted-foreground">Eindeutige Lexeme mit aufgezeichneten Versuchen</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Letzter Versuch
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <Flame className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{lastPracticed}</p>
            <p className="mt-1 text-xs text-muted-foreground">Aktualisiert nach jeder eingereichten Lösung</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Gesamtleistung</span>
            <span>{summary.accuracy}%</span>
          </div>
          <ProgressBar value={summary.accuracy} className="h-3 overflow-hidden rounded-full border border-border/60 bg-muted" />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
          <motion.div
            className="h-10 w-10 rounded-full bg-primary/10 p-2"
            initial={{ scale: 0.9, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <BookOpen className="h-full w-full text-primary" aria-hidden />
          </motion.div>
          <div>
            <p className="text-sm font-medium text-foreground">
              {summary.total > 0
                ? `${summary.total} Versuch${summary.total === 1 ? '' : 'e'} erfasst`
                : 'Noch keine Versuche gespeichert'}
            </p>
            <p className="text-xs text-muted-foreground">
              Jede Antwort speist deine gemischten Übungssitzungen mit besseren Empfehlungen.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

