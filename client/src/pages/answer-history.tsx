import { useEffect, useMemo, useState } from "react";
import type { CEFRLevel } from "@shared";
import { Link } from "wouter";
import {
  ArrowLeft,
  BarChart2,
  History,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { AnsweredQuestionsPanel } from "@/components/answered-questions-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AnsweredQuestion,
  loadAnswerHistory,
  saveAnswerHistory,
} from "@/lib/answer-history";

type LevelFilter = CEFRLevel | "all";
type ResultFilter = "all" | "correct" | "incorrect";

const LEVEL_FILTERS: LevelFilter[] = ["all", "A1", "A2", "B1", "B2", "C1", "C2"];
const RESULT_FILTERS: ResultFilter[] = ["all", "correct", "incorrect"];

export default function AnswerHistoryPage() {
  const [history, setHistory] = useState<AnsweredQuestion[]>(() => loadAnswerHistory());
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");

  useEffect(() => {
    saveAnswerHistory(history);
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesLevel = levelFilter === "all" || item.level === levelFilter;
      const matchesResult = resultFilter === "all" || item.result === resultFilter;
      return matchesLevel && matchesResult;
    });
  }, [history, levelFilter, resultFilter]);

  const totalAnswers = history.length;
  const totalCorrect = useMemo(
    () => history.filter((item) => item.result === "correct").length,
    [history],
  );
  const totalIncorrect = totalAnswers - totalCorrect;
  const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;

  const handleClearHistory = () => {
    setHistory([]);
  };

  const topBar = (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
          <History className="h-4 w-4" aria-hidden />
          Answer review hub
        </p>
        <h1 className="text-3xl font-semibold text-foreground lg:text-4xl">
          Answer history
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Explore every attempt you have made, filter by CEFR level or result, and revisit the verbs that need extra attention.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/">
          <Button variant="secondary" className="rounded-2xl px-6">
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
            Back to practice
          </Button>
        </Link>
        <Button
          variant="outline"
          onClick={handleClearHistory}
          disabled={totalAnswers === 0}
          className="rounded-2xl px-6"
        >
          <Trash2 className="mr-2 h-4 w-4" aria-hidden />
          Clear history
        </Button>
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
            <SidebarNavButton href="/answers" icon={History} label="Answer history" exact />
            <SidebarNavButton href="/analytics" icon={BarChart2} label="Analytics" />
            <SidebarNavButton href="/admin" icon={Settings2} label="Admin tools" />
          </div>
        </div>
        <div className="rounded-3xl border border-border/60 bg-muted/40 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Snapshot
          </p>
          <div className="mt-4 space-y-3 text-sm text-foreground">
            <div className="flex items-center justify-between">
              <span>Total answers</span>
              <Badge className="rounded-full bg-primary/20 text-primary">{totalAnswers}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Correct</span>
              <Badge className="rounded-full border-success-border/50 bg-success-muted text-success-muted-foreground">
                {totalCorrect}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Incorrect</span>
              <Badge className="rounded-full border-warning-border/50 bg-warning-muted text-warning-muted-foreground">
                {totalIncorrect}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Accuracy</span>
              <Badge variant="outline" className="rounded-full border-primary/40 text-primary">
                {accuracy}%
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <div className="space-y-3 rounded-3xl border border-border/60 bg-muted/40 p-5 text-sm shadow-sm">
        <p className="font-semibold text-foreground">Why keep a log?</p>
        <p className="text-xs text-muted-foreground">
          Reviewing your past answers helps reinforce correct forms and spot patterns in mistakes so you can adjust your study plan.
        </p>
      </div>
    </div>
  );

  const filterControls = (
    <div className="grid gap-6 rounded-3xl border border-border/60 bg-card/80 p-6 shadow-lg shadow-primary/5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by level</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {LEVEL_FILTERS.map((option) => (
            <Button
              key={option}
              variant={option === levelFilter ? "default" : "secondary"}
              className="rounded-2xl px-4"
              onClick={() => setLevelFilter(option)}
            >
              {option === "all" ? "All" : option}
            </Button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Filter by result</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {RESULT_FILTERS.map((option) => (
            <Button
              key={option}
              variant={option === resultFilter ? "default" : "secondary"}
              className="rounded-2xl px-4 capitalize"
              onClick={() => setResultFilter(option)}
            >
              {option}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell sidebar={sidebar} topBar={topBar}>
      <div className="space-y-6">
        {filterControls}
        <AnsweredQuestionsPanel
          history={filteredHistory}
          title="Detailed answer log"
          description="Track your responses across every practice session. Each entry includes the correct forms and contextual examples so you can revise with confidence."
          emptyStateMessage="Once you start practicing, your answers will appear here with all the details you need to review."
        />
      </div>
    </AppShell>
  );
}

