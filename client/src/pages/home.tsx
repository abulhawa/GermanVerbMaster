import { useState, useEffect } from 'react';
import { PracticeCard } from '@/components/practice-card';
import { ProgressDisplay } from '@/components/progress-display';
import { SettingsDialog } from '@/components/settings-dialog';
import { Settings, Progress, PracticeMode } from '@/lib/types';
import { getRandomVerb, GermanVerb } from '@/lib/verbs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart2, Loader2 } from 'lucide-react';
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
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">German Verb Practice</h1>
            <p className="text-sm text-muted-foreground">
              Build your conjugation skills with smart spaced repetition and track your streak.
            </p>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Badge variant="secondary">Level {settings.level}</Badge>
            <Link href="/analytics">
              <Button variant="outline" size="icon" title="View analytics">
                <BarChart2 className="h-4 w-4" />
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
        </header>

        <ProgressDisplay progress={progress} currentLevel={settings.level} />

        {currentVerb && (
          <PracticeCard
            verb={currentVerb}
            mode={currentMode}
            settings={settings}
            onCorrect={handleCorrect}
            onIncorrect={handleIncorrect}
          />
        )}

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          {historyIndex > 0 && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={goBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous verb
            </Button>
          )}
          <Button
            variant="outline"
            className="flex-1"
            onClick={nextQuestion}
          >
            Skip to next
          </Button>
        </div>
      </div>
    </div>
  );
}