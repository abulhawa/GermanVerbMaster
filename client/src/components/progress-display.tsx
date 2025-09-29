import { Progress } from "@/lib/types";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Flame, BookOpen, Loader2 } from "lucide-react";
import { getVerbsByLevel } from "@/lib/verbs";
import { useQuery } from "@tanstack/react-query";

interface ProgressDisplayProps {
  progress: Progress;
  currentLevel: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}

export function ProgressDisplay({ progress, currentLevel }: ProgressDisplayProps) {
  const { data: verbsInLevel, isLoading } = useQuery({
    queryKey: ['verbs', currentLevel],
    queryFn: () => getVerbsByLevel(currentLevel),
  });

  const percentage = progress.total > 0 
    ? Math.round((progress.correct / progress.total) * 100) 
    : 0;

  const totalVerbsInLevel = verbsInLevel?.length ?? 0;
  const practicedVerbsCount = (progress.practicedVerbs?.[currentLevel] || []).length;
  const remainingVerbsCount = totalVerbsInLevel - practicedVerbsCount;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-6">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-border bg-card shadow-sm">
      <CardHeader className="space-y-4 pb-0">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-foreground">
              Progress overview
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground">
              Track how consistently you are mastering verbs across {currentLevel}.
            </CardDescription>
          </div>
          <Badge
            variant="outline"
            className="flex items-center gap-1 rounded-full border border-secondary/40 bg-secondary/10 text-xs uppercase tracking-[0.18em] text-secondary-foreground"
          >
            <Flame className="h-4 w-4" aria-hidden />
            {progress.streak} day{progress.streak === 1 ? '' : 's'} streak
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6 text-muted-foreground">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Accuracy
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Trophy className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{percentage}%</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Based on {progress.total} attempt{progress.total === 1 ? '' : 's'}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Mastered verbs
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                <BookOpen className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{practicedVerbsCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {remainingVerbsCount} remaining in level {currentLevel}
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Active streak
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-secondary/10 text-secondary">
                <Flame className="h-4 w-4" aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-3xl font-semibold text-foreground">{progress.streak} day{progress.streak === 1 ? '' : 's'}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Last practiced {new Date(progress.lastPracticed).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Overall mastery</span>
            <span>{percentage}%</span>
          </div>
          <ProgressBar value={percentage} className="h-3 overflow-hidden rounded-full border border-border bg-muted" />
        </div>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <BookOpen className="h-10 w-10 rounded-full bg-primary/10 p-2 text-primary" aria-hidden />
          <div>
            <p className="text-sm font-medium text-foreground">
              Level {currentLevel}: {practicedVerbsCount} of {totalVerbsInLevel} verbs practiced
            </p>
            <p className="text-xs text-muted-foreground">
              Keep going—consistency compounds your progress.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}