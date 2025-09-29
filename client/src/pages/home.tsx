import { useEffect, useMemo, useState } from 'react';
import { PracticeCard } from '@/components/practice-card';
import { ProgressDisplay } from '@/components/progress-display';
import { SettingsDialog } from '@/components/settings-dialog';
import { Settings, Progress, PracticeMode } from '@/lib/types';
import { getRandomVerb, GermanVerb } from '@/lib/verbs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart2, Loader2, Sparkles } from 'lucide-react';
import { Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';

interface VerbHistoryItem {
  verb: GermanVerb;
  mode: PracticeMode;
}

const DEFAULT_SETTINGS: Settings = {
  level: 'A1',
  showHints: true,
  showExamples: true,
};

const DEFAULT_PROGRESS: Progress = {
  correct: 0,
  total: 0,
  lastPracticed: new Date().toISOString(),
  streak: 0,
  practicedVerbs: {
    A1: [],
    A2: [],
    B1: [],
    B2: [],
    C1: [],
    C2: [],
  },
};

const PRACTICE_MODES: PracticeMode[] = ['präteritum', 'partizipII', 'auxiliary'];

export default function Home() {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [progress, setProgress] = useState<Progress>(() => {
    const saved = localStorage.getItem('progress');
    if (!saved) return DEFAULT_PROGRESS;

    const parsedProgress = JSON.parse(saved);
    return {
      ...DEFAULT_PROGRESS,
      ...parsedProgress,
      practicedVerbs: {
        ...DEFAULT_PROGRESS.practicedVerbs,
        ...(parsedProgress.practicedVerbs || {}),
      },
    };
  });

  const [currentMode, setCurrentMode] = useState<PracticeMode>('präteritum');
  const [verbHistory, setVerbHistory] = useState<VerbHistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const { data: currentVerb, isLoading: verbLoading, refetch: refetchVerb } = useQuery({
    queryKey: ['verb', settings.level, historyIndex],
    queryFn: () => getRandomVerb(settings.level),
    enabled: true,
  });

  const practicedVerbsCount = useMemo(
    () => (progress.practicedVerbs?.[settings.level] || []).length,
    [progress.practicedVerbs, settings.level],
  );

  const accuracy = progress.total > 0
    ? Math.round((progress.correct / progress.total) * 100)
    : 0;

  const nextMilestone = useMemo(() => {
    if (practicedVerbsCount === 0) return 10;
    const base = Math.ceil(practicedVerbsCount / 10) * 10;
    return Math.max(base, practicedVerbsCount + 5);
  }, [practicedVerbsCount]);

  const milestoneProgress = Math.min(
    100,
    Math.round((practicedVerbsCount / nextMilestone) * 100),
  );

  const PRACTICE_MODE_LABELS: Record<PracticeMode, string> = {
    präteritum: 'Präteritum',
    partizipII: 'Partizip II',
    auxiliary: 'Auxiliary',
    english: 'English',
  };

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('progress', JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    refetchVerb();
    setVerbHistory([]);
    setHistoryIndex(-1);
  }, [settings.level]);

  const handleCorrect = () => {
    if (!currentVerb) return;

    setProgress(prev => {
      const updatedPracticedVerbs = {
        ...prev.practicedVerbs,
        [settings.level]: Array.from(new Set([...prev.practicedVerbs[settings.level], currentVerb.infinitive]))
      };

      return {
        ...prev,
        correct: prev.correct + 1,
        total: prev.total + 1,
        lastPracticed: new Date().toISOString(),
        practicedVerbs: updatedPracticedVerbs,
      };
    });
    setTimeout(nextQuestion, 1500);
  };

  const handleIncorrect = () => {
    setProgress(prev => ({
      ...prev,
      total: prev.total + 1,
      lastPracticed: new Date().toISOString(),
    }));
    setTimeout(nextQuestion, 2500);
  };

  const nextQuestion = () => {
    if (!currentVerb) return;

    setVerbHistory(prev => [...prev.slice(0, historyIndex + 1), { verb: currentVerb, mode: currentMode }]);
    setHistoryIndex(prev => prev + 1);

    refetchVerb();
    setCurrentMode(PRACTICE_MODES[Math.floor(Math.random() * PRACTICE_MODES.length)]);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const previousItem = verbHistory[historyIndex - 1];
      setHistoryIndex(prev => prev - 1);
      setCurrentMode(previousItem.mode);
    }
  };

  if (verbLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(99,102,241,0.35),transparent_55%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(45,212,191,0.25),transparent_60%)]" />

      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_25px_80px_rgba(15,23,42,0.65)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <Badge className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-200">
                Level {settings.level}
              </Badge>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                Adaptive spaced repetition
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                German Verb Mastery
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
                Build fluency with a modern practice experience that celebrates your wins, adapts to your pace, and syncs seamlessly across devices.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              {PRACTICE_MODES.map((mode) => (
                <span
                  key={mode}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-slate-300"
                >
                  {PRACTICE_MODE_LABELS[mode]}
                </span>
              ))}
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:w-auto sm:items-end">
            <div className="flex items-center gap-2">
              <Link href="/analytics">
                <Button
                  variant="secondary"
                  className="h-11 rounded-full border border-white/10 bg-white/10 px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/20"
                  title="View analytics"
                >
                  <BarChart2 className="mr-2 h-4 w-4" />
                  Insights
                </Button>
              </Link>
              <SettingsDialog
                settings={settings}
                onSettingsChange={(newSettings) => {
                  setSettings(newSettings);
                  if (newSettings.level !== settings.level) {
                    setProgress(DEFAULT_PROGRESS);
                  }
                }}
              />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-muted-foreground">
              <p className="font-semibold text-foreground">Session snapshot</p>
              <p className="mt-1 text-xs text-slate-300">
                {progress.total > 0
                  ? `${accuracy}% accuracy across ${progress.total} attempt${progress.total === 1 ? '' : 's'} today.`
                  : 'Take your first attempt to unlock personalized insights.'}
              </p>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <ProgressDisplay progress={progress} currentLevel={settings.level} />

          <div className="space-y-6">
            {currentVerb && (
              <PracticeCard
                verb={currentVerb}
                mode={currentMode}
                settings={settings}
                onCorrect={handleCorrect}
                onIncorrect={handleIncorrect}
                className="h-full"
              />
            )}

            <div className="grid gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 text-sm text-muted-foreground backdrop-blur">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em]">
                Next milestone
                <span className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                  {nextMilestone} verbs
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/10">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-accent"
                  style={{ width: `${milestoneProgress}%` }}
                />
              </div>
              <p className="text-xs text-slate-300">
                {practicedVerbsCount} of {nextMilestone} verbs mastered at level {settings.level}. Keep practicing to unlock new difficulty bands.
              </p>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          {historyIndex > 0 && (
            <Button
              variant="secondary"
              className="flex-1 rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-slate-100 transition hover:bg-white/20"
              onClick={goBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous verb
            </Button>
          )}
          <Button
            variant="secondary"
            className="flex-1 rounded-full border border-white/10 bg-white/10 text-sm font-semibold text-slate-100 transition hover:bg-white/20"
            onClick={nextQuestion}
          >
            Skip to next
          </Button>
        </div>
      </div>
    </div>
  );
}