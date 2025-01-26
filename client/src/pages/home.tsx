import { useState, useEffect } from 'react';
import { PracticeCard } from '@/components/practice-card';
import { ProgressDisplay } from '@/components/progress-display';
import { SettingsDialog } from '@/components/settings-dialog';
import { Settings, Progress, PracticeMode } from '@/lib/types';
import { getRandomVerb } from '@/lib/verbs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
  const [currentVerb, setCurrentVerb] = useState(() => getRandomVerb(settings.level));

  useEffect(() => {
    setCurrentVerb(getRandomVerb(settings.level));
  }, [settings.level]);

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('progress', JSON.stringify(progress));
  }, [progress]);

  const handleCorrect = () => {
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
    setCurrentVerb(getRandomVerb(settings.level));
    setCurrentMode(PRACTICE_MODES[Math.floor(Math.random() * PRACTICE_MODES.length)]);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-primary">German Verb Practice</h1>
            <Badge variant="secondary" className="mt-2">
              Level: {settings.level}
            </Badge>
          </div>
          <SettingsDialog 
            settings={settings} 
            onSettingsChange={(newSettings) => {
              setSettings(newSettings);
              // Reset progress when changing levels
              if (newSettings.level !== settings.level) {
                setProgress(DEFAULT_PROGRESS);
              }
            }} 
          />
        </div>

        <ProgressDisplay progress={progress} currentLevel={settings.level} />

        <PracticeCard
          verb={currentVerb}
          mode={currentMode}
          settings={settings}
          onCorrect={handleCorrect}
          onIncorrect={handleIncorrect}
        />

        <Button 
          variant="outline" 
          className="w-full"
          onClick={nextQuestion}
        >
          Skip to next
        </Button>
      </div>
    </div>
  );
}