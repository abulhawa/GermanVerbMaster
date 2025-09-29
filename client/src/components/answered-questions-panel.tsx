import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PracticeMode } from "@/lib/types";
import type { AnsweredQuestion } from "@/lib/answer-history";

const MODE_LABELS: Record<PracticeMode, string> = {
  präteritum: "Präteritum",
  partizipII: "Partizip II",
  auxiliary: "Auxiliary",
  english: "English",
};

const formatDuration = (milliseconds: number) => {
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds} second${totalSeconds === 1 ? "" : "s"}`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (seconds === 0) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}`;
};

interface AnsweredQuestionsPanelProps {
  history: AnsweredQuestion[];
  title?: string;
  description?: string;
  emptyStateMessage?: string;
  className?: string;
}

export function AnsweredQuestionsPanel({
  history,
  title = "Recent answers",
  description = "Review each response, the correct forms, and contextual examples.",
  emptyStateMessage = "Answer a prompt to unlock a detailed breakdown of the verb, its meaning, and usage examples.",
  className,
}: AnsweredQuestionsPanelProps) {
  return (
    <section className={cn("rounded-3xl border border-border/60 bg-card/90 p-6 shadow-lg shadow-primary/5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Badge variant="outline" className="rounded-full border-primary/30 bg-primary/10 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
          Study log
        </Badge>
      </div>

      {history.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground">{emptyStateMessage}</p>
      ) : (
        <div className="mt-5 space-y-4">
          {history.map((item) => {
            const answeredDate = new Date(item.answeredAt);
            const answeredTime = answeredDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm"
                aria-label={`Answer review for ${item.verb.infinitive}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{item.verb.infinitive}</h3>
                    <p className="text-sm text-muted-foreground">{item.verb.english}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 text-right">
                    <Badge
                      className={cn(
                        "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]",
                        item.result === "correct"
                          ? "border-success-border bg-success text-success-foreground"
                          : "border-warning-border bg-warning text-warning-foreground",
                      )}
                    >
                      {item.result === "correct" ? "Correct" : "Incorrect"}
                    </Badge>
                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      {MODE_LABELS[item.mode]}
                    </span>
                    <span className="text-xs text-muted-foreground">Level {item.level}</span>
                    <span className="text-xs text-muted-foreground">Answered at {answeredTime}</span>
                  </div>
                </div>

                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <dt className="font-semibold text-foreground">Prompt</dt>
                    <dd className="text-muted-foreground">{item.prompt}</dd>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <dt className="font-semibold text-foreground">Time spent</dt>
                    <dd className="text-muted-foreground">{formatDuration(item.timeSpent)}</dd>
                  </div>
                  {item.attemptedAnswer && (
                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-foreground">Your answer</dt>
                      <dd className="text-muted-foreground">{item.attemptedAnswer}</dd>
                    </div>
                  )}
                  {item.result === "incorrect" && (
                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-foreground">Expected</dt>
                      <dd className="text-muted-foreground">{item.correctAnswer}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 rounded-2xl bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Examples</p>
                  <ul className="mt-2 space-y-3 text-sm">
                    <li>
                      <p className="font-semibold text-foreground">Präteritum usage</p>
                      <p className="text-muted-foreground">{item.verb.präteritumExample || "No example available."}</p>
                    </li>
                    <li>
                      <p className="font-semibold text-foreground">Partizip II usage</p>
                      <p className="text-muted-foreground">{item.verb.partizipIIExample || "No example available."}</p>
                    </li>
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
