import { useMemo } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { BarChart3, BookOpen } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { SidebarNavButton } from "@/components/layout/sidebar-nav-button";
import { MobileNavBar } from "@/components/layout/mobile-nav-bar";
import { getPrimaryNavigationItems } from "@/components/layout/navigation";
import { AnalyticsDashboard } from "@/components/analytics-dashboard";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ProgressDisplay } from "@/components/progress-display";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDevAttributes } from "@/lib/dev-attributes";
import { useAuthSession } from "@/auth/session";
import { loadPracticeProgress } from "@/lib/practice-progress";
import { loadPracticeSession } from "@/lib/practice-session";
import { loadAnswerHistory } from "@/lib/answer-history";
import {
  SCOPE_LABELS,
  buildCefrLabel,
  computePracticeSummary,
  computeScope,
  getVerbLevel,
  normalisePreferredTaskTypes,
} from "@/lib/practice-overview";
import { usePracticeSettings } from "@/contexts/practice-settings-context";

interface SessionProgressBarProps {
  value: number;
  completed: number;
  target: number;
  debugId?: string;
}

function SessionProgressBar({ value, completed, target, debugId }: SessionProgressBarProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "session-progress";

  return (
    <div
      className="w-full rounded-3xl border border-border/70 bg-card/80 p-6 shadow-lg shadow-primary/5"
      {...getDevAttributes("session-progress-bar", resolvedDebugId)}
    >
      <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        <span>Session progress</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="mt-4 h-3 w-full overflow-hidden rounded-full border border-border/60 bg-muted">
        <motion.span
          className="block h-full rounded-full bg-gradient-to-r from-brand-gradient-start via-primary to-brand-gradient-end"
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        {completed} of {target} tasks completed in this session.
      </p>
    </div>
  );
}

export default function Analytics() {
  const { settings } = usePracticeSettings();
  const progress = useMemo(() => loadPracticeProgress(), []);
  const practiceSession = useMemo(() => loadPracticeSession(), []);
  const answerHistory = useMemo(() => loadAnswerHistory(), []);

  const scope = computeScope(settings);
  const activeTaskTypes = useMemo(() => {
    const preferred = settings.preferredTaskTypes.length
      ? settings.preferredTaskTypes
      : [settings.defaultTaskType];
    return normalisePreferredTaskTypes(preferred);
  }, [settings.preferredTaskTypes, settings.defaultTaskType]);
  const activeTaskType = activeTaskTypes[0] ?? settings.defaultTaskType;

  const summary = useMemo(
    () => computePracticeSummary(progress, activeTaskTypes),
    [progress, activeTaskTypes],
  );

  const scopeBadgeLabel =
    scope === "custom" ? `${SCOPE_LABELS[scope]} (${activeTaskTypes.length})` : SCOPE_LABELS[scope];
  const cefrLabel = useMemo(() => buildCefrLabel(activeTaskTypes, settings), [activeTaskTypes, settings]);
  const cefrLevelForDisplay = scope === "verbs" ? getVerbLevel(settings) : undefined;

  const sessionCompleted = practiceSession.completed.length;
  const milestoneTarget = useMemo(() => {
    if (sessionCompleted === 0) {
      return 10;
    }
    const base = Math.ceil(sessionCompleted / 10) * 10;
    return Math.max(base, sessionCompleted + 5);
  }, [sessionCompleted]);
  const milestoneProgress = milestoneTarget
    ? Math.min(100, Math.round((sessionCompleted / milestoneTarget) * 100))
    : 0;
  const historyCount = answerHistory.length;

  const overviewPanel = (
    <div className="space-y-4">
      <ProgressDisplay
        progress={progress}
        taskType={activeTaskType}
        taskTypes={activeTaskTypes}
        taskLabel={scopeBadgeLabel}
        cefrLevel={cefrLevelForDisplay}
        cefrLabel={cefrLabel}
        headline={`${scopeBadgeLabel} progress`}
        debugId="analytics-progress-display"
      />
      <SessionProgressBar
        value={milestoneProgress}
        completed={sessionCompleted}
        target={milestoneTarget}
        debugId="analytics-session-progress"
      />
    </div>
  );

  const attemptsPanel = (
    <div className="rounded-2xl border border-border/60 bg-muted/30 p-5 shadow-inner shadow-primary/5">
      <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
        Session recap
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          {historyCount} entries
        </span>
      </div>
      <div className="mt-4 flex items-start gap-3 text-sm">
        <motion.div
          className="h-10 w-10 shrink-0 rounded-full bg-primary/10 p-2"
          initial={{ scale: 0.9, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <BookOpen className="h-full w-full text-primary" aria-hidden />
        </motion.div>
        <div className="space-y-2">
          <p className="font-medium text-foreground">{summary.correct} correct attempts logged</p>
          <p className="text-sm text-muted-foreground">
            {summary.total > 0
              ? `${summary.total} attempt${summary.total === 1 ? "" : "s"} recorded · ${summary.accuracy}% accuracy`
              : "Take your first attempt to unlock personalised insights."}
          </p>
          <Link href="/answers" className="inline-flex items-center text-sm font-medium text-primary">
            Review history
            <span aria-hidden className="ml-2">
              →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
  const { data: authSession } = useAuthSession();
  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession?.user.role ?? null),
    [authSession?.user.role],
  );

  const sidebar = (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="grid gap-2">
          {navigationItems.map((item) => (
            <SidebarNavButton
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              exact={item.exact}
            />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      sidebar={sidebar}
      mobileNav={<MobileNavBar items={navigationItems} />}
    >
      <section className="space-y-4 rounded-3xl border border-border/60 bg-card/85 p-6 shadow-soft shadow-primary/5">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Performance insights</p>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
            <BarChart3 className="h-6 w-6 text-primary" aria-hidden />
            Analytics dashboard
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Dive into your progress trends, identify tricky verbs, and celebrate your growth with responsive dashboards.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
          <Link href="/">
            <Button variant="secondary" className="rounded-2xl px-5">
              Back to practice
            </Button>
          </Link>
          <Avatar className="h-11 w-11 border border-border/60 shadow-sm">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">LV</AvatarFallback>
          </Avatar>
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,2.4fr)_minmax(0,1.6fr)]">
        <div className="space-y-6">
          <AnalyticsDashboard />
        </div>
        <aside className="space-y-6">
          <div className="rounded-3xl border border-border/60 bg-card/80 shadow-xl shadow-primary/5 lg:hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Performance center</p>
                <p className="text-lg font-semibold text-foreground">{summary.accuracy}% accuracy</p>
                <p className="text-sm text-muted-foreground">
                  Tracking {historyCount} logged attempt{historyCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>
            <Accordion type="single" collapsible defaultValue="overview" className="divide-y divide-border/60">
              <AccordionItem value="overview">
                <AccordionTrigger className="px-5 py-3 text-sm font-medium text-muted-foreground">
                  Overview
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-5 pb-5">{overviewPanel}</AccordionContent>
              </AccordionItem>
              <AccordionItem value="attempts">
                <AccordionTrigger className="px-5 py-3 text-sm font-medium text-muted-foreground">
                  Attempts
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-5 pb-5">{attemptsPanel}</AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          <Tabs defaultValue="overview" className="hidden w-full rounded-3xl border border-border/60 bg-card/80 shadow-xl shadow-primary/5 lg:block">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Performance center</p>
                <p className="text-lg font-semibold text-foreground">{summary.accuracy}% accuracy</p>
                <p className="text-sm text-muted-foreground">
                  Tracking {historyCount} logged attempt{historyCount === 1 ? "" : "s"}
                </p>
              </div>
              <TabsList className="flex rounded-full bg-muted/40 p-1">
                <TabsTrigger
                  value="overview"
                  className="rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="attempts"
                  className="rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  Attempts
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="space-y-4 px-6 py-6">
              {overviewPanel}
            </TabsContent>

            <TabsContent value="attempts" className="space-y-4 px-6 py-6">
              {attemptsPanel}
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </AppShell>
  );
}
