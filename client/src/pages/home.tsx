import { useState, useEffect } from 'react';
import { PracticeCard } from '@/components/practice-card';
import { ProgressDisplay } from '@/components/progress-display';
import { SettingsDialog } from '@/components/settings-dialog';
import { Settings, Progress, PracticeMode } from '@/lib/types';
import { getRandomVerb } from '@/lib/verbs';
import { Button } from '@/components/ui/button';

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
};

const PRACTICE_MODES: PracticeMode[] = ['präteritum', 'partizipII', 'auxiliary'];

export default function Home() {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [progress, setProgress] = useState<Progress>(() => {
    const saved = localStorage.getItem('progress');
    return saved ? JSON.parse(saved) : DEFAULT_PROGRESS;
  });

  const [currentMode, setCurrentMode] = useState<PracticeMode>('präteritum');
  const [currentVerb, setCurrentVerb] = useState(() => getRandomVerb(settings.level));

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('progress', JSON.stringify(progress));
  }, [progress]);

  const handleCorrect = () => {
    setProgress(prev => ({
      ...prev,
      correct: prev.correct + 1,
      total: prev.total + 1,
      lastPracticed: new Date().toISOString(),
    }));
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
          <h1 className="text-2xl font-bold text-primary">German Verb Practice</h1>
          <SettingsDialog settings={settings} onSettingsChange={setSettings} />
        </div>

        <ProgressDisplay progress={progress} />

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
