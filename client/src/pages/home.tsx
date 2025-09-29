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
  return (
    <div className="w-full rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lg shadow-primary/5">
      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <span>Milestone progress</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-border/60 bg-muted">
        <motion.span
          className="block h-full rounded-full bg-gradient-to-r from-sky-500 via-primary to-emerald-500"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {practiced} of {target} verbs locked in for this streak cycle.
      </p>
    </div>
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
        <h1 className="text-3xl font-semibold text-foreground lg:text-4xl">
          Practice that feels purposeful
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Learn faster with adaptive drills, beautiful visuals, and a motivating progress tracker that celebrates every streak.
        </p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-muted/40 p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Flame className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Streak
            </p>
            <p className="text-lg font-semibold text-foreground">{progress.streak} day{progress.streak === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-3xl border border-border/60 bg-muted/40 p-4 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary/15 text-secondary">
            <Target className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Accuracy
            </p>
            <p className="text-lg font-semibold text-foreground">{accuracy}%</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/analytics">
            <Button className="rounded-2xl px-6">
              <BarChart2 className="mr-2 h-4 w-4" aria-hidden />
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
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
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
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              CEFR Levels
            </p>
            <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-[10px] uppercase tracking-[0.22em] text-primary">
              Adaptive
            </Badge>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {LEVELS.map((level) => (
              <Button
                key={level}
                variant={level === settings.level ? "default" : "secondary"}
                onClick={() => changeLevel(level)}
                className="rounded-2xl px-0 py-3 text-sm font-semibold"
              >
                {level}
              </Button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-3 rounded-3xl border border-border/60 bg-muted/40 p-5 text-sm shadow-sm">
        <p className="font-semibold text-foreground">Session recap</p>
        <p className="text-xs text-muted-foreground">
          {progress.total > 0
            ? `${progress.total} attempt${progress.total === 1 ? "" : "s"} today · ${accuracy}% accuracy`
            : "Take your first attempt to unlock personalized insights."}
        </p>
      </div>
    </div>
  );

  const isInitialLoading = verbLoading && !currentVerb;

  return (
    <AppShell sidebar={sidebar} topBar={topBar}>
      <div className="grid gap-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section className="flex flex-col items-center gap-6">
          <div className="flex w-full max-w-xl flex-col items-center gap-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              <Sparkles className="h-3 w-3" aria-hidden />
              {PRACTICE_MODE_LABELS[currentMode]}
            </div>
            <h2 className="text-3xl font-semibold text-foreground">Focus mode</h2>
            <p className="text-sm text-muted-foreground">
              Answer the prompt below to keep your streak alive and unlock deeper analytics.
            </p>
          </div>

          <div className="w-full max-w-2xl">
            {isInitialLoading ? (
              <div className="flex h-[340px] items-center justify-center rounded-3xl border border-dashed border-border/70 bg-card/70">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
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

          <SessionProgressBar value={milestoneProgress} practiced={practicedVerbsCount} target={nextMilestone} />

          <div className="flex w-full flex-col gap-3 sm:flex-row">
            {historyIndex > 0 && (
              <Button
                variant="secondary"
                className="flex-1 rounded-2xl"
                onClick={goBack}
              >
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                Previous verb
              </Button>
            )}
            <Button
              variant="secondary"
              className="flex-1 rounded-2xl"
              onClick={nextQuestion}
            >
              Skip to next
            </Button>
          </div>
        </section>

        <aside className="space-y-6">
          <ProgressDisplay progress={progress} currentLevel={settings.level} />
          <div className="rounded-3xl border border-border/60 bg-card/80 p-6 text-center shadow-lg shadow-primary/5">
            <h2 className="text-lg font-semibold text-foreground">Need a recap?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Visit your answer history to revisit detailed breakdowns, correct forms, and usage examples.
            </p>
            <Link href="/answers">
              <Button className="mt-4 w-full rounded-2xl">
                <History className="mr-2 h-4 w-4" aria-hidden />
                Review answer history
              </Button>
            </Link>
          </div>
          <div className="rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg shadow-primary/5">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Next milestone
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
                {nextMilestone} verbs
              </span>
            </div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-border/60 bg-muted">
              <motion.span
                className="block h-full rounded-full bg-gradient-to-r from-sky-500 via-primary to-emerald-500"
                initial={{ width: 0 }}
                animate={{ width: `${milestoneProgress}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {practicedVerbsCount} of {nextMilestone} verbs mastered at level {settings.level}. Keep practicing to unlock new difficulty bands.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-secondary/30 bg-secondary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-secondary">
              <BookOpen className="h-4 w-4" aria-hidden />
              Level mastery snapshot
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
