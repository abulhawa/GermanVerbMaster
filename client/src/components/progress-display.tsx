import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Trophy, Flame, BookOpen, Loader2 } from "lucide-react";

import { Progress as ProgressModel } from "@/lib/types";
import { getVerbsByLevel } from "@/lib/verbs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/primitives/card";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";

interface ProgressDisplayProps {
  progress: ProgressModel;
  currentLevel: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
}

export function ProgressDisplay({ progress, currentLevel }: ProgressDisplayProps) {
  const { data: verbsInLevel, isLoading } = useQuery({
    queryKey: ["verbs", currentLevel],
    queryFn: () => getVerbsByLevel(currentLevel),
  });

  const percentage = progress.total > 0 ? Math.round((progress.correct / progress.total) * 100) : 0;
  const totalVerbsInLevel = verbsInLevel?.length ?? 0;
  const practicedVerbsCount = (progress.practicedVerbs?.[currentLevel] || []).length;
  const remainingVerbsCount = Math.max(0, totalVerbsInLevel - practicedVerbsCount);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-4 pb-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-fg">Progress overview</CardTitle>
            <CardDescription className="text-sm text-muted">
              Track how consistently you are mastering verbs across level {currentLevel}.
            </CardDescription>
          </div>
          <Badge
            tone="warning"
            size="sm"
            className="flex items-center gap-2 rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.22em]"
          >
            <Flame className="h-4 w-4" aria-hidden />
            {progress.streak} day{progress.streak === 1 ? "" : "s"} streak
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 text-muted">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Accuracy
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-fg">{percentage}%</p>
            <p className="mt-1 text-xs text-muted">
              Based on {progress.total} attempt{progress.total === 1 ? "" : "s"}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Mastered verbs
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-info/10 text-info">
                <BookOpen className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-fg">{practicedVerbsCount}</p>
            <p className="mt-1 text-xs text-muted">
              {remainingVerbsCount} remaining in level {currentLevel}
            </p>
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Active streak
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-warning/10 text-warning">
                <Flame className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-fg">{progress.streak} day{progress.streak === 1 ? "" : "s"}</p>
            <p className="mt-1 text-xs text-muted">
              Last practiced {new Date(progress.lastPracticed).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Overall mastery</span>
            <span>{percentage}%</span>
          </div>
          <ProgressBar value={percentage} className="h-3 overflow-hidden rounded-full border border-border/60 bg-muted" />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm">
          <motion.div
            className="h-10 w-10 rounded-full bg-info/10 p-2"
            initial={{ scale: 0.9, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <BookOpen className="h-full w-full text-info" aria-hidden />
          </motion.div>
          <div>
            <p className="text-sm font-medium text-fg">
              Level {currentLevel}: {practicedVerbsCount} of {totalVerbsInLevel} verbs practiced
            </p>
            <p className="text-xs text-muted">Keep going—consistency compounds your progress.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
