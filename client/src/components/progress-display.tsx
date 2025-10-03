import { Fragment, useMemo, type ReactNode } from 'react';
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
import { useLocale, useTranslations } from '@/locales';

type PluralizedMessage = { singular: string; plural: string };

function formatTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((result, [token, value]) => {
    return result.replaceAll(`{${token}}`, value);
  }, template);
}

function selectPlural(count: number, forms: PluralizedMessage): string {
  return count === 1 ? forms.singular : forms.plural;
}

function getTaskTypeLabel(taskType: TaskType, labels: Partial<Record<TaskType, string>>): string {
  return labels[taskType] ?? taskType;
}

function interpolateNodes(template: string, replacements: Record<string, ReactNode | undefined>): ReactNode[] {
  const pattern = /{(\w+)}/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(template.slice(lastIndex, match.index));
    }

    const key = match[1];
    const replacement = replacements[key];
    if (replacement !== undefined) {
      nodes.push(replacement);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    nodes.push(template.slice(lastIndex));
  }

  return nodes;
}

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
  headline,
  isLoading = false,
  debugId,
}: ProgressDisplayProps) {
  const { locale } = useLocale();
  const translations = useTranslations().progressDisplay;
  const resolvedHeadline = headline ?? translations.headline;
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
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }), [locale]);
  const descriptor =
    taskLabel ??
    (resolvedTaskTypes.length > 1
      ? formatTemplate(selectPlural(resolvedTaskTypes.length, translations.taskDescriptor.mix), {
          count: numberFormatter.format(resolvedTaskTypes.length),
        })
      : formatTemplate(translations.taskDescriptor.single, {
          taskType: getTaskTypeLabel(resolvedTaskTypes[0], translations.taskTypeLabels),
        }));
  const cefrDisplay =
    cefrLabel ?? (cefrLevel ? formatTemplate(translations.cefrLevel, { level: cefrLevel }) : undefined);
  const descriptionTemplate = cefrDisplay
    ? translations.description.withCefr
    : translations.description.withoutCefr;
  const descriptionNodes = useMemo(
    () =>
      interpolateNodes(descriptionTemplate, {
        descriptor: (
          <span key="descriptor" className="font-semibold text-foreground">
            {descriptor}
          </span>
        ),
        cefr: cefrDisplay ? <span key="cefr">{cefrDisplay}</span> : undefined,
      }),
    [cefrDisplay, descriptor, descriptionTemplate],
  );
  const streakText = formatTemplate(selectPlural(summary.streak, translations.streak.label), {
    count: numberFormatter.format(summary.streak),
  });
  const lastPracticed = summary.lastPracticedAt
    ? dateFormatter.format(new Date(summary.lastPracticedAt))
    : translations.cards.lastAttempt.never;
  const accuracyValue = `${numberFormatter.format(summary.accuracy)}%`;
  const accuracyDescriptor = formatTemplate(selectPlural(summary.total, translations.cards.accuracy.basedOn), {
    count: numberFormatter.format(summary.total),
  });
  const uniqueLexemesValue = numberFormatter.format(summary.uniqueLexemes);
  const attemptsSummary =
    summary.total > 0
      ? formatTemplate(selectPlural(summary.total, translations.attemptsSummary.logged), {
          count: numberFormatter.format(summary.total),
        })
      : translations.attemptsSummary.none;

  return (
    <Card
      debugId={`${resolvedDebugId}-card`}
      className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5"
      {...getDevAttributes('progress-overview-card', resolvedDebugId)}
    >
      <CardHeader className="space-y-4 pb-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-foreground">{resolvedHeadline}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              {descriptionNodes.map((node, index) => (
                <Fragment key={index}>{node}</Fragment>
              ))}
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="flex items-center gap-2 rounded-full border border-secondary/40 bg-secondary/10 px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-secondary"
          >
            <Flame className="h-4 w-4" aria-hidden />
            {streakText}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 text-muted-foreground">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {translations.cards.accuracy.title}
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{accuracyValue}</p>
            <p className="mt-1 text-xs text-muted-foreground">{accuracyDescriptor}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {translations.cards.lexemes.title}
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{uniqueLexemesValue}</p>
            <p className="mt-1 text-xs text-muted-foreground">{translations.cards.lexemes.subtitle}</p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {translations.cards.lastAttempt.title}
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <Flame className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{lastPracticed}</p>
            <p className="mt-1 text-xs text-muted-foreground">{translations.cards.lastAttempt.subtitle}</p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{translations.performance.heading}</span>
            <span>{accuracyValue}</span>
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
              {attemptsSummary}
            </p>
            <p className="text-xs text-muted-foreground">
              {translations.insight}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

