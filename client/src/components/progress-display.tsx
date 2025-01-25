import { Progress } from "@/lib/types";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Flame } from "lucide-react";

interface ProgressDisplayProps {
  progress: Progress;
}

export function ProgressDisplay({ progress }: ProgressDisplayProps) {
  const percentage = progress.total > 0 
    ? Math.round((progress.correct / progress.total) * 100) 
    : 0;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Your Progress</span>
          <Badge variant="secondary" className="flex items-center gap-1">
            <Flame className="h-4 w-4" />
            {progress.streak} days
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <span className="text-lg font-medium">{progress.correct} correct out of {progress.total}</span>
        </div>
        
        <ProgressBar value={percentage} className="h-2" />
        
        <div className="text-sm text-muted-foreground">
          Last practiced: {new Date(progress.lastPracticed).toLocaleDateString()}
        </div>
      </CardContent>
    </Card>
  );
}
