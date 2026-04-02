import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useTranslations } from '@/locales';

export interface B2CountdownProps {
  examDate: Date;
  isActive: boolean;
}

function toDateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function computeDaysUntil(examDate: Date): number {
  const today = toDateOnly(new Date());
  const target = toDateOnly(examDate);
  const diffMs = target.getTime() - today.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function formatTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((message, [token, value]) => {
    return message.replaceAll(`{${token}}`, value);
  }, template);
}

export function B2Countdown({ examDate, isActive }: B2CountdownProps) {
  const translations = useTranslations();
  const daysUntilExam = useMemo(() => computeDaysUntil(examDate), [examDate]);

  if (!isActive || daysUntilExam < 0) {
    return null;
  }

  const text =
    daysUntilExam === 0
      ? translations.home.b2Countdown.today
      : formatTemplate(translations.home.b2Countdown.upcoming, { days: String(daysUntilExam) });
  const countdownClassName =
    daysUntilExam <= 3
      ? 'text-destructive animate-pulse'
      : daysUntilExam <= 7
        ? 'text-warning-strong'
        : 'text-muted-foreground';

  return (
    <p
      className={cn(
        'rounded-xl border border-border/70 bg-card/70 px-3 py-1 text-sm font-medium',
        countdownClassName,
      )}
    >
      {text}
    </p>
  );
}
