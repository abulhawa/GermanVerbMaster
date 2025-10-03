import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ProgressDisplay } from '@/components/progress-display';
import { createEmptyProgressState } from '@/lib/practice-progress';
import { LocaleProvider } from '@/locales';

describe('ProgressDisplay', () => {
  it('renders English copy for an empty progress state', () => {
    const progress = createEmptyProgressState();

    render(
      <LocaleProvider initialLocale="en">
        <ProgressDisplay progress={progress} taskType="conjugate_form" />
      </LocaleProvider>,
    );

    expect(screen.getByText('Progress overview')).toBeInTheDocument();
    expect(screen.getByText('Progress for Task type Conjugation.')).toBeInTheDocument();
    expect(screen.getByText('No attempts recorded yet')).toBeInTheDocument();
    expect(screen.getByText('No attempts saved yet')).toBeInTheDocument();
    expect(
      screen.getByText('Each answer improves your mixed practice sessions with better recommendations.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Based on 0 attempts')).toBeInTheDocument();
    expect(screen.getByText('Overall performance')).toBeInTheDocument();
    expect(screen.getByText('Unique lexemes with recorded attempts')).toBeInTheDocument();
    expect(screen.getByText('Last attempt')).toBeInTheDocument();
    expect(screen.getByText('0-day streak')).toBeInTheDocument();
  });

  it('pluralizes attempt strings in English when attempts are recorded', () => {
    const progress = createEmptyProgressState();

    progress.totals.conjugate_form = {
      ...progress.totals.conjugate_form,
      correctAttempts: 1,
      incorrectAttempts: 0,
      streak: 2,
      lastPracticedAt: '2025-03-10T00:00:00.000Z',
      lexemes: {
        'lex-1': {
          lexemeId: 'lex-1',
          taskId: 'task-1',
          lastPracticedAt: '2025-03-10T00:00:00.000Z',
          correctAttempts: 1,
          incorrectAttempts: 0,
        },
      },
    };

    render(
      <LocaleProvider initialLocale="en">
        <ProgressDisplay progress={progress} taskType="conjugate_form" />
      </LocaleProvider>,
    );

    expect(screen.getByText('Based on 1 attempt')).toBeInTheDocument();
    expect(screen.getByText('1 attempt logged')).toBeInTheDocument();
  });

  it('renders German translations when the locale is set to de', () => {
    const progress = createEmptyProgressState();

    render(
      <LocaleProvider initialLocale="de">
        <ProgressDisplay progress={progress} taskType="conjugate_form" />
      </LocaleProvider>,
    );

    expect(screen.getByText('Fortschrittsübersicht')).toBeInTheDocument();
    expect(screen.getByText('Fortschritt für Aufgabentyp Konjugation.')).toBeInTheDocument();
    expect(screen.getByText('Serie von 0 Tagen')).toBeInTheDocument();
    expect(screen.getByText('Basierend auf 0 Versuchen')).toBeInTheDocument();
    expect(screen.getByText('Noch keine Versuche gespeichert')).toBeInTheDocument();
    expect(screen.getByText('Noch keine Versuche aufgezeichnet')).toBeInTheDocument();
    expect(
      screen.getByText('Jede Antwort verbessert deine gemischten Übungen mit besseren Empfehlungen.'),
    ).toBeInTheDocument();
  });
});
