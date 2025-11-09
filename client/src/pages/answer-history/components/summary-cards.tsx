import { Skeleton } from "@/components/ui/skeleton";

interface SummaryCardsProps {
  sectionId?: string;
  totalAnswers: number;
  totalCorrect: number;
  totalIncorrect: number;
  accuracy: number;
  formattedAverageTime: string;
  isLoading: boolean;
  showSkeletonStats: boolean;
}

export function SummaryCards({
  sectionId,
  totalAnswers,
  totalCorrect,
  totalIncorrect,
  accuracy,
  formattedAverageTime,
  isLoading,
  showSkeletonStats,
}: SummaryCardsProps) {
  return (
    <section className="grid gap-4 md:grid-cols-3" id={sectionId}>
      <div className="space-y-2 rounded-3xl border border-border/60 bg-card/85 p-5 shadow-soft shadow-primary/5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Total attempts</p>
        {showSkeletonStats ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl font-semibold text-foreground">{totalAnswers}</p>
        )}
        <p className="text-xs text-muted-foreground">Across all recorded sessions</p>
      </div>
      <div className="space-y-2 rounded-3xl border border-border/60 bg-card/85 p-5 shadow-soft shadow-primary/5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Accuracy</p>
        {showSkeletonStats ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-3xl font-semibold text-foreground">{accuracy}%</p>
        )}
        <p className="text-xs text-muted-foreground">
          {totalCorrect} correct • {totalIncorrect} incorrect
        </p>
      </div>
      <div className="space-y-2 rounded-3xl border border-border/60 bg-card/85 p-5 shadow-soft shadow-primary/5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Average response time</p>
        {showSkeletonStats ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <p className="text-3xl font-semibold text-foreground">{formattedAverageTime}</p>
        )}
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Refreshing recent answers" : "Based on recent answers"}
        </p>
      </div>
    </section>
  );
}
