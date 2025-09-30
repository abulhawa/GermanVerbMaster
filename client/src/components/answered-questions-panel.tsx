import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/primitives/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
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
    <Card className={cn("space-y-6", className)}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-xl font-semibold text-fg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Badge tone="primary" size="sm" className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]">
          Study log
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {history.length === 0 ? (
          <p className="rounded-xl bg-muted/40 p-4 text-sm text-muted">{emptyStateMessage}</p>
        ) : (
          <div className="space-y-4">
            {history.map((item) => {
              const answeredDate = new Date(item.answeredAt);
              const answeredTime = answeredDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-border bg-surface p-4 shadow-sm"
                  aria-label={`Answer review for ${item.verb.infinitive}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-fg">{item.verb.infinitive}</h3>
                      <p className="text-sm text-muted">{item.verb.english}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 text-right">
                      <Badge
                        tone={item.result === "correct" ? "success" : "danger"}
                        className="px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]"
                      >
                        {item.result === "correct" ? "Correct" : "Incorrect"}
                      </Badge>
                      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
                        {MODE_LABELS[item.mode]}
                      </span>
                      <span className="text-xs text-muted">Level {item.level}</span>
                      <span className="text-xs text-muted">Answered at {answeredTime}</span>
                    </div>
                  </div>

                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-fg">Prompt</dt>
                      <dd className="text-muted">{item.prompt}</dd>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-fg">Time spent</dt>
                      <dd className="text-muted">{formatDuration(item.timeSpent)}</dd>
                    </div>
                    {item.attemptedAnswer && (
                      <div className="flex flex-wrap gap-2">
                        <dt className="font-semibold text-fg">Your answer</dt>
                        <dd className="text-muted">{item.attemptedAnswer}</dd>
                      </div>
                    )}
                    {item.result === "incorrect" && (
                      <div className="flex flex-wrap gap-2">
                        <dt className="font-semibold text-fg">Expected</dt>
                        <dd className="text-muted">{item.correctAnswer}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="mt-4 rounded-2xl bg-muted/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Examples</p>
                    <ul className="mt-2 space-y-3 text-sm">
                      <li>
                        <p className="font-semibold text-fg">Präteritum usage</p>
                        <p className="text-muted">{item.verb.präteritumExample || "No example available."}</p>
                      </li>
                      <li>
                        <p className="font-semibold text-fg">Partizip II usage</p>
                        <p className="text-muted">{item.verb.partizipIIExample || "No example available."}</p>
                      </li>
                    </ul>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
