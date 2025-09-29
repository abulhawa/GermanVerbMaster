import { Progress } from "@/lib/types";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Your Progress</span>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Flame className="h-4 w-4" />
            {progress.streak} days
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          <span className="text-lg font-medium">
            {progress.correct} correct out of {progress.total}
          </span>
        </div>

        <ProgressBar value={percentage} className="h-2" />

        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          <div>
            <div className="text-sm font-medium">
              Level {currentLevel}: {practicedVerbsCount} of {totalVerbsInLevel} verbs practiced
            </div>
            <div className="text-sm text-muted-foreground">
              {remainingVerbsCount} verbs remaining
            </div>
          </div>
        </div>

        <div className="text-sm text-muted-foreground">
          Last practiced: {new Date(progress.lastPracticed).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}