import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PracticeMode } from "@/lib/types";
import { getTaskTypeLabel } from "@/lib/task-metadata";
import type { AnsweredQuestion } from "@/lib/answer-history";
import type { AnswerHistoryLexemeSnapshot } from "@shared";
import { derivePromptLemmaFromEntry } from "@/lib/prompt-lemma";
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from "@/lib/dev-attributes";

const MODE_LABELS: Record<PracticeMode, string> = {
  präteritum: "Präteritum",
  partizipII: "Partizip II",
  auxiliary: "Auxiliary",
  english: "English",
};

function deriveExpectedAnswer(expected: unknown): string | undefined {
  if (typeof expected === "string") {
    return expected;
  }
  if (!expected || typeof expected !== "object") {
    return undefined;
  }
  const record = expected as Record<string, unknown>;
  const form = typeof record.form === "string" ? record.form : undefined;
  const article = typeof record.article === "string" ? record.article : undefined;
  if (form) {
    return [article, form].filter(Boolean).join(" ").trim();
  }
  if (typeof record.value === "string") {
    return record.value;
  }
  return undefined;
}

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

interface AnsweredQuestionsPanelProps extends DebuggableComponentProps {
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
  debugId,
}: AnsweredQuestionsPanelProps) {
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : "answered-questions-panel";

  return (
    <section
      {...getDevAttributes("answered-questions-panel-root", resolvedDebugId)}
      className={cn("rounded-3xl border border-border/60 bg-card/90 p-6 shadow-lg shadow-primary/5", className)}
    >
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
        <p
          {...getDevAttributes("answered-questions-panel-empty", resolvedDebugId)}
          className="mt-4 rounded-2xl bg-muted/40 p-4 text-sm text-muted-foreground"
        >
          {emptyStateMessage}
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          {history.map((item) => {
            const answeredDate = new Date(item.answeredAt);
            const answeredTimestamp = answeredDate.getTime();
            const hasValidTimestamp = Number.isFinite(answeredTimestamp);
            const answeredTime = hasValidTimestamp
              ? answeredDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : null;
            const answeredDateLabel = hasValidTimestamp
              ? answeredDate.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
              : null;
            const verb = item.verb ?? item.legacyVerb?.verb;
            const lexeme: AnswerHistoryLexemeSnapshot | undefined =
              item.lexeme ??
              (verb
                ? ({
                    id: `legacy:verb:${verb.infinitive}`,
                    lemma: verb.infinitive,
                    pos: "verb",
                    level: verb.level,
                    english: verb.english,
                    example: verb.präteritumExample ? { de: verb.präteritumExample } : undefined,
                    auxiliary: verb.auxiliary,
                  } satisfies AnswerHistoryLexemeSnapshot)
                : undefined);
            const mode = item.mode ?? item.legacyVerb?.mode;
            const level = item.level ?? item.cefrLevel ?? "A1";
            const prompt = item.prompt ?? item.promptSummary;
            const attempted = item.attemptedAnswer ?? (typeof item.submittedResponse === "string" ? item.submittedResponse : "");
            const promptLemma = derivePromptLemmaFromEntry(item);
            const expected =
              item.result === "correct"
                ? undefined
                : item.correctAnswer ?? deriveExpectedAnswer(item.expectedResponse);
            const displayTitle = lexeme?.lemma ?? verb?.infinitive ?? promptLemma ?? prompt ?? "Unknown task";
            const subtitle = lexeme?.english ?? verb?.english ?? "";
            const präteritumExample = verb?.präteritumExample;
            const partizipIIExample = verb?.partizipIIExample;
            const lexemeExampleDe = !verb ? lexeme?.example?.de : undefined;
            const lexemeExampleEn = !verb ? lexeme?.example?.en : undefined;
            const hasVerbExamples = Boolean(präteritumExample || partizipIIExample);
            const hasLexemeExample = !hasVerbExamples && Boolean(lexemeExampleDe || lexemeExampleEn);

            return (
              <article
                key={item.id}
                className="rounded-2xl border border-border/70 bg-background/95 p-4 shadow-sm"
                aria-label={`Answer review for ${displayTitle}`}
                {...getDevAttributes(
                  "answered-questions-panel-item",
                  `${resolvedDebugId}-${item.id}`,
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">{displayTitle}</h3>
                    <p className="text-sm text-muted-foreground">{subtitle}</p>
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
                      {mode ? MODE_LABELS[mode] ?? mode : getTaskTypeLabel(item.taskType)}
                    </span>
                    <span className="text-xs text-muted-foreground">Level {level}</span>
                    <span className="text-xs text-muted-foreground">
                      {answeredDateLabel && answeredTime
                        ? `Answered on ${answeredDateLabel} at ${answeredTime}`
                        : answeredTime
                          ? `Answered at ${answeredTime}`
                          : 'Answer time unavailable'}
                    </span>
                  </div>
                </div>

                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <dt className="font-semibold text-foreground">Prompt</dt>
                    <dd className="text-muted-foreground">{prompt}</dd>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <dt className="font-semibold text-foreground">Time spent</dt>
                    <dd className="text-muted-foreground">{formatDuration(item.timeSpent ?? item.timeSpentMs)}</dd>
                  </div>
                  {attempted && (
                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-foreground">Your answer</dt>
                      <dd className="text-muted-foreground">{attempted}</dd>
                    </div>
                  )}
                  {item.result === "incorrect" && expected && (
                    <div className="flex flex-wrap gap-2">
                      <dt className="font-semibold text-foreground">Expected</dt>
                      <dd className="text-muted-foreground">{expected}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 rounded-2xl bg-muted/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Examples</p>
                  <ul className="mt-2 space-y-3 text-sm">
                    {hasVerbExamples ? (
                      <>
                        <li>
                          <p className="font-semibold text-foreground">Präteritum usage</p>
                          <p className="text-muted-foreground">{präteritumExample ?? "No example available."}</p>
                        </li>
                        <li>
                          <p className="font-semibold text-foreground">Partizip II usage</p>
                          <p className="text-muted-foreground">{partizipIIExample ?? "No example available."}</p>
                        </li>
                      </>
                    ) : hasLexemeExample ? (
                      <li>
                        <p className="font-semibold text-foreground">Example usage</p>
                        {lexemeExampleDe && <p className="text-muted-foreground">{lexemeExampleDe}</p>}
                        {lexemeExampleEn && <p className="text-muted-foreground">{lexemeExampleEn}</p>}
                      </li>
                    ) : (
                      <li>
                        <p className="font-semibold text-foreground">Example usage</p>
                        <p className="text-muted-foreground">No example available.</p>
                      </li>
                    )}
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
