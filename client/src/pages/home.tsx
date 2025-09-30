import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BarChart2,
  BookOpen,
  History,
  Compass,
  Flame,
  Loader2,
  Settings2,
  Sparkles,
  Target,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PracticeCard, PracticeAnswerDetails } from "@/components/practice-card";
import { ProgressDisplay } from "@/components/progress-display";
import { SettingsDialog } from "@/components/settings-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/primitives/card";
import { Section } from "@/components/primitives/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { Settings, Progress, PracticeMode } from "@/lib/types";
import { GermanVerb, getRandomVerb } from "@/lib/verbs";
import {
  AnsweredQuestion,
  appendAnswer,
  loadAnswerHistory,
  saveAnswerHistory,
  DEFAULT_MAX_STORED_ANSWERS,
} from "@/lib/answer-history";

interface VerbHistoryItem {
  verb: GermanVerb;
  mode: PracticeMode;
}

const MAX_STORED_ANSWER_HISTORY = DEFAULT_MAX_STORED_ANSWERS;

const DEFAULT_SETTINGS: Settings = {
  level: "A1",
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

const PRACTICE_MODES: PracticeMode[] = ["präteritum", "partizipII", "auxiliary"];
const LEVELS: Array<Settings["level"]> = ["A1", "A2", "B1", "B2", "C1", "C2"];

function SessionProgressBar({ value, practiced, target }: { value: number; practiced: number; target: number }) {
  const percentage = Math.min(100, Math.max(0, value));

  return (
    <Card className="w-full">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted">
          <span>Milestone progress</span>
          <span>{Math.round(percentage)}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full border border-border/60 bg-muted">
          <motion.span
            className="block h-full rounded-full bg-gradient-to-r from-primary via-primary to-info"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </div>
        <p className="text-xs text-muted">
          {practiced} of {target} verbs locked in for this streak cycle.
        </p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("settings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [progress, setProgress] = useState<Progress>(() => {
    const saved = localStorage.getItem("progress");
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

  const [currentMode, setCurrentMode] = useState<PracticeMode>("präteritum");
  const [verbHistory, setVerbHistory] = useState<VerbHistoryItem[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [answerHistory, setAnswerHistory] = useState<AnsweredQuestion[]>(() => loadAnswerHistory());

  const {
    data: currentVerb,
    isLoading: verbLoading,
    refetch: refetchVerb,
  } = useQuery({
    queryKey: ["verb", settings.level, historyIndex],
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
    präteritum: "Präteritum",
    partizipII: "Partizip II",
    auxiliary: "Auxiliary",
    english: "English",
  };

  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("progress", JSON.stringify(progress));
  }, [progress]);

  useEffect(() => {
    refetchVerb();
    setVerbHistory([]);
    setHistoryIndex(-1);
  }, [settings.level, refetchVerb]);

  useEffect(() => {
    saveAnswerHistory(answerHistory);
  }, [answerHistory]);

  const handleCorrect = () => {
    if (!currentVerb) return;

    setProgress((prev) => {
      const updatedPracticedVerbs = {
        ...prev.practicedVerbs,
        [settings.level]: Array.from(new Set([
          ...prev.practicedVerbs[settings.level],
          currentVerb.infinitive,
        ])),
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
    setProgress((prev) => ({
      ...prev,
      total: prev.total + 1,
      lastPracticed: new Date().toISOString(),
    }));
    setTimeout(nextQuestion, 2500);
  };

  const handleAnswer = (details: PracticeAnswerDetails) => {
    if (!currentVerb) return;

    setAnswerHistory((prev) => {
      const entry: AnsweredQuestion = {
        id: `${details.verb.infinitive}-${Date.now()}`,
        verb: details.verb,
        mode: details.mode,
        result: details.isCorrect ? "correct" : "incorrect",
        attemptedAnswer: details.attemptedAnswer,
        correctAnswer: details.correctAnswer,
        prompt: details.prompt,
        timeSpent: details.timeSpent,
        answeredAt: new Date().toISOString(),
        level: settings.level,
      };

      return appendAnswer(entry, prev, MAX_STORED_ANSWER_HISTORY);
    });
  };

  const nextQuestion = () => {
    if (!currentVerb) return;

    setVerbHistory((prev) => [
      ...prev.slice(0, historyIndex + 1),
      { verb: currentVerb, mode: currentMode },
    ]);
    setHistoryIndex((prev) => prev + 1);

    refetchVerb();
    setCurrentMode(PRACTICE_MODES[Math.floor(Math.random() * PRACTICE_MODES.length)]);
  };

  const goBack = () => {
    if (historyIndex > 0) {
      const previousItem = verbHistory[historyIndex - 1];
      setHistoryIndex((prev) => prev - 1);
      setCurrentMode(previousItem.mode);
    }
  };

  const changeLevel = (level: Settings["level"]) => {
    if (level === settings.level) return;
    setSettings((prev) => ({ ...prev, level }));
    setProgress(DEFAULT_PROGRESS);
  };

  const topBar = (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          <Sparkles className="h-4 w-4" aria-hidden />
          German Verb Mastery
        </p>
        <h1 className="text-3xl font-semibold text-fg lg:text-4xl">
          Practice that feels purposeful
        </h1>
        <p className="max-w-xl text-sm text-muted">
          Learn faster with adaptive drills, beautiful visuals, and a motivating progress tracker that celebrates every streak.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Card className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Flame className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Streak
            </p>
            <p className="text-lg font-semibold text-fg">{progress.streak} day{progress.streak === 1 ? "" : "s"}</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4 p-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-info/15 text-info">
            <Target className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Accuracy
            </p>
            <p className="text-lg font-semibold text-fg">{accuracy}%</p>
          </div>
        </Card>
        <div className="flex items-center gap-3">
          <Button asChild className="px-6">
            <Link href="/analytics">
              <BarChart2 className="h-4 w-4" aria-hidden />
              Insights
            </Link>
          </Button>
          <SettingsDialog
            settings={settings}
            onSettingsChange={(newSettings) => {
              setSettings(newSettings);
              if (newSettings.level !== settings.level) {
                setProgress(DEFAULT_PROGRESS);
              }
            }}
          />
          <div className="hidden sm:block">
            <Avatar className="h-11 w-11 border border-border/60 shadow-sm">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                LV
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
    </div>
  );

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Navigate
          </p>
          <div className="grid gap-2">
            <SidebarNavButton href="/" icon={Sparkles} label="Practice" exact />
            <SidebarNavButton href="/answers" icon={History} label="Answer history" />
            <SidebarNavButton href="/analytics" icon={Compass} label="Analytics" />
            <SidebarNavButton href="/admin" icon={Settings2} label="Admin tools" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              CEFR Levels
            </p>
            <Badge tone="primary" size="sm" className="rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.22em]">
              Adaptive
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {LEVELS.map((level) => (
              <Button
                key={level}
                tone={level === settings.level ? "primary" : "default"}
                variant={level === settings.level ? "solid" : "outline"}
                onClick={() => changeLevel(level)}
                className="rounded-2xl px-0 py-3 text-sm font-semibold"
              >
                {level}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <Card className="space-y-3 p-5 text-sm">
        <CardHeader className="space-y-2 p-0">
          <CardTitle className="text-base font-semibold text-fg">Session recap</CardTitle>
          <CardDescription className="text-xs text-muted">
            {progress.total > 0
              ? `${progress.total} attempt${progress.total === 1 ? "" : "s"} today · ${accuracy}% accuracy`
              : "Take your first attempt to unlock personalized insights."}
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );

  const isInitialLoading = verbLoading && !currentVerb;

  return (
    <AppShell sidebar={sidebar} topBar={topBar}>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section className="flex flex-col items-center text-center">
          <Badge
            tone="primary"
            size="sm"
            className="gap-2 uppercase tracking-[0.22em]"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {PRACTICE_MODE_LABELS[currentMode]}
          </Badge>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold text-fg">Focus mode</h2>
            <p className="text-sm text-muted">
              Answer the prompt below to keep your streak alive and unlock deeper analytics.
            </p>
          </div>

          <div className="w-full max-w-2xl">
            {isInitialLoading ? (
              <Card className="flex h-[340px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </Card>
            ) : (
              currentVerb && (
                <PracticeCard
                  key={`${currentVerb.infinitive}-${currentMode}`}
                  verb={currentVerb}
                  mode={currentMode}
                  settings={settings}
                  onCorrect={handleCorrect}
                  onIncorrect={handleIncorrect}
                  onAnswer={handleAnswer}
                  className="mx-auto"
                />
              )
            )}
          </div>

          <div className="w-full max-w-2xl">
            <SessionProgressBar
              value={milestoneProgress}
              practiced={practicedVerbsCount}
              target={nextMilestone}
            />
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row">
            {historyIndex > 0 && (
              <Button variant="outline" tone="default" className="flex-1" onClick={goBack}>
                <ArrowLeft className="h-4 w-4" aria-hidden />
                Previous verb
              </Button>
            )}
            <Button variant="outline" tone="primary" className="flex-1" onClick={nextQuestion}>
              Skip to next
            </Button>
          </div>
        </Section>

        <Section>
          <ProgressDisplay progress={progress} currentLevel={settings.level} />
          <Card className="text-center">
            <CardHeader className="space-y-2">
              <CardTitle>Need a recap?</CardTitle>
              <CardDescription>
                Visit your answer history to revisit detailed breakdowns, correct forms, and usage examples.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button asChild className="w-full">
                <Link href="/answers">
                  <History className="h-4 w-4" aria-hidden />
                  Review answer history
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                Next milestone
                <Badge tone="primary" size="sm" className="gap-2 uppercase tracking-[0.2em]">
                  {nextMilestone} verbs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="h-3 w-full overflow-hidden rounded-full border border-border/60 bg-muted">
                <motion.span
                  className="block h-full rounded-full bg-gradient-to-r from-primary via-primary to-info"
                  initial={{ width: 0 }}
                  animate={{ width: `${milestoneProgress}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <p className="text-sm text-muted">
                {practicedVerbsCount} of {nextMilestone} verbs mastered at level {settings.level}. Keep practicing to unlock new difficulty bands.
              </p>
              <Badge tone="info" size="sm" className="inline-flex items-center gap-2 uppercase tracking-[0.2em]">
                <BookOpen className="h-4 w-4" aria-hidden />
                Level mastery snapshot
              </Badge>
            </CardContent>
          </Card>
        </Section>
      </div>
    </AppShell>
  );
}
