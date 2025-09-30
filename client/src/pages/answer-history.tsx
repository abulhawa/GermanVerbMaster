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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/primitives/card";
import { Section } from "@/components/primitives/section";
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
        <h1 className="text-3xl font-semibold text-fg lg:text-4xl">
          Answer history
        </h1>
        <p className="max-w-xl text-sm text-muted">
          Explore every attempt you have made, filter by CEFR level or result, and revisit the verbs that need extra attention.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" tone="primary" className="rounded-2xl px-6">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to practice
          </Link>
        </Button>
        <Button
          variant="outline"
          tone="danger"
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
      <div className="space-y-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Navigate
          </p>
          <div className="grid gap-2">
            <SidebarNavButton href="/" icon={Sparkles} label="Practice" exact />
            <SidebarNavButton href="/answers" icon={History} label="Answer history" exact />
            <SidebarNavButton href="/analytics" icon={BarChart2} label="Analytics" />
            <SidebarNavButton href="/admin" icon={Settings2} label="Admin tools" />
          </div>
        </div>
        <Card>
          <CardHeader className="space-y-3 pb-0">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Snapshot
            </p>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-fg">
            <div className="flex items-center justify-between">
              <span>Total answers</span>
              <Badge tone="primary" size="sm" className="px-3 py-1 text-xs">
                {totalAnswers}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Correct</span>
              <Badge tone="success" size="sm" className="px-3 py-1 text-xs">
                {totalCorrect}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Incorrect</span>
              <Badge tone="danger" size="sm" className="px-3 py-1 text-xs">
                {totalIncorrect}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span>Accuracy</span>
              <Badge tone="primary" size="sm" className="px-3 py-1 text-xs">
                {accuracy}%
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="text-base font-semibold text-fg">Why keep a log?</CardTitle>
          <CardDescription className="text-xs text-muted">
            Reviewing your past answers helps reinforce correct forms and spot patterns in mistakes so you can adjust your study plan.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );

  const filterControls = (
    <Card>
      <CardContent className="grid gap-6">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Filter by level</p>
          <div className="flex flex-wrap gap-2">
            {LEVEL_FILTERS.map((option) => (
              <Button
                key={option}
                tone={option === levelFilter ? "primary" : "default"}
                variant={option === levelFilter ? "solid" : "outline"}
                className="px-4"
                onClick={() => setLevelFilter(option)}
              >
                {option === "all" ? "All" : option}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Filter by result</p>
          <div className="flex flex-wrap gap-2">
            {RESULT_FILTERS.map((option) => (
              <Button
                key={option}
                tone={option === resultFilter ? "primary" : "default"}
                variant={option === resultFilter ? "solid" : "outline"}
                className="px-4 capitalize"
                onClick={() => setResultFilter(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <AppShell sidebar={sidebar} topBar={topBar}>
      <Section>
        {filterControls}
        <AnsweredQuestionsPanel
          history={filteredHistory}
          title="Detailed answer log"
          description="Track your responses across every practice session. Each entry includes the correct forms and contextual examples so you can revise with confidence."
          emptyStateMessage="Once you start practicing, your answers will appear here with all the details you need to review."
        />
      </Section>
    </AppShell>
  );
}

