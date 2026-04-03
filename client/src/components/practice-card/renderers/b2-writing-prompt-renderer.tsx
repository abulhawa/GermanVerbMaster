import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { submitPracticeAttempt } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/locales';
import type { CEFRLevel } from '@shared';

import { ActionButtonContent, formatShortcutKey } from '../components/action-button-content';
import { PracticeCardReviewControls } from '../components/practice-card-review-controls';
import { PracticeCardScaffold } from '../components/practice-card-scaffold';
import type { RendererProps } from '../types';
import { createErrorToast, createOfflineToast } from '../utils/data';

const MAX_RESPONSE_LENGTH = 500;

interface B2FeedbackResult {
  score: number;
  result: 'correct' | 'incorrect';
  strengths: string[];
  improvements: string[];
  correctedSentence?: string;
  keyPhrasesFound: string[];
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalisePhraseSet(phrases: string[]): Set<string> {
  return new Set(
    phrases
      .map((phrase) => phrase.trim().toLocaleLowerCase())
      .filter((phrase) => phrase.length > 0),
  );
}

function getScoreBadgeClass(score: number): string {
  if (score >= 70) {
    return 'border-success-border/70 bg-success-muted text-success-foreground';
  }
  if (score >= 60) {
    return 'border-warning-border/70 bg-warning-muted text-warning-foreground';
  }
  return 'border-destructive/60 bg-destructive/15 text-destructive';
}

export function B2WritingPromptRenderer({
  task,
  onResult,
  className,
  debugId,
  isLoadingNext,
  sessionProgress,
  onContinue,
  onSkip,
}: RendererProps<'b2_writing_prompt'>) {
  const { toast } = useToast();
  const { practiceCard: copy } = useTranslations();
  const b2Copy = copy.b2Writing;
  const [responseText, setResponseText] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [feedback, setFeedback] = useState<B2FeedbackResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPersisting, setIsPersisting] = useState(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    setResponseText('');
    setStatus('idle');
    setFeedback(null);
    setIsAnalyzing(false);
    setIsPersisting(false);
    startTimeRef.current = Date.now();
  }, [task.taskId]);

  const keyPhrases = task.expectedSolution?.keyPhrases ?? [];
  const keyPhraseSet = useMemo(() => normalisePhraseSet(keyPhrases), [keyPhrases]);
  const usedWordBankSet = useMemo(() => {
    const normalizedResponse = responseText.toLocaleLowerCase();
    return new Set(
      task.prompt.wordBankItems.filter((item) =>
        normalizedResponse.includes(item.toLocaleLowerCase()),
      ),
    );
  }, [responseText, task.prompt.wordBankItems]);
  const canSubmit =
    status === 'idle' &&
    !isAnalyzing &&
    !isPersisting &&
    responseText.trim().length > 0;

  const handleWordBankInsert = (phrase: string) => {
    if (status !== 'idle' || isAnalyzing || isPersisting) {
      return;
    }

    setResponseText((previous) => {
      const trimmedEnd = previous.replace(/\s+$/, '');
      const spacer = trimmedEnd.length > 0 ? ' ' : '';
      const nextValue = `${trimmedEnd}${spacer}${phrase}`;
      return nextValue.slice(0, MAX_RESPONSE_LENGTH);
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    const submitted = responseText.trim();
    if (!submitted) {
      return;
    }

    setIsAnalyzing(true);
    setFeedback(null);

    try {
      const feedbackResponse = await fetch('/api/b2/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: task.prompt.scenario,
          userResponse: submitted,
          keyPhrases,
          grammarFocus: task.expectedSolution?.grammarFocus ?? '',
        }),
      });

      if (!feedbackResponse.ok) {
        const body = (await feedbackResponse.json().catch(() => ({ error: b2Copy.analysisFailed }))) as {
          error?: string;
        };
        throw new Error(body.error ?? b2Copy.analysisFailed);
      }

      const feedbackPayload = (await feedbackResponse.json()) as B2FeedbackResult;
      const normalizedFeedback: B2FeedbackResult = {
        ...feedbackPayload,
        score: clampScore(feedbackPayload.score),
        strengths: Array.isArray(feedbackPayload.strengths)
          ? feedbackPayload.strengths.slice(0, 2)
          : [],
        improvements: Array.isArray(feedbackPayload.improvements)
          ? feedbackPayload.improvements.slice(0, 2)
          : [],
        keyPhrasesFound: Array.isArray(feedbackPayload.keyPhrasesFound)
          ? feedbackPayload.keyPhrasesFound
          : [],
      };

      const answeredAt = new Date().toISOString();
      const timeSpentMs = Date.now() - startTimeRef.current;
      const promptSummary = `${task.prompt.scenario} ${task.prompt.taskInstructions}`.trim();
      const result = normalizedFeedback.result;

      setFeedback(normalizedFeedback);
      setStatus(result);
      setIsAnalyzing(false);

      const payload = {
        taskId: task.taskId,
        lexemeId: task.lexemeId,
        taskType: task.taskType,
        pos: task.pos,
        renderer: task.renderer,
        result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        promptSummary,
        timeSpentMs,
        answeredAt,
        cefrLevel: task.lexeme.metadata?.level as CEFRLevel | undefined,
      } as const;

      try {
        onResult({
          task,
          result,
          submittedResponse: submitted,
          expectedResponse: task.expectedSolution,
          promptSummary,
          timeSpentMs,
          answeredAt,
        });
      } catch {
        // Ignore callback errors so persistence still runs.
      }

      setIsPersisting(true);
      void submitPracticeAttempt(payload)
        .then(({ queued }) => {
          if (queued) {
            createOfflineToast(copy, toast)();
          }
        })
        .catch((error) => {
          const fallbackMessage = copy.error.generic;
          const message = error instanceof Error && error.message ? error.message : fallbackMessage;
          createErrorToast(copy, toast, message);
          setStatus('idle');
          setFeedback(null);
        })
        .finally(() => {
          setIsPersisting(false);
        });
    } catch (error) {
      setIsAnalyzing(false);
      const fallbackMessage = b2Copy.analysisFailed;
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;
      createErrorToast(copy, toast, message);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const canSkip = Boolean(onSkip) && !isAnalyzing && !isPersisting && status === 'idle';
  const feedbackFoundSet = useMemo(
    () => normalisePhraseSet(feedback?.keyPhrasesFound ?? []),
    [feedback?.keyPhrasesFound],
  );

  const promptSection = (
    <>
      <h1 className="sr-only">{task.lexeme.lemma}</h1>
      <div className="w-full max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning-strong">
          {b2Copy.scenarioLabel}
        </p>
        <p className="mt-2 text-sm text-primary-foreground/90">{task.prompt.scenario}</p>
        <p className="mt-3 text-sm text-primary-foreground/80">{task.prompt.taskInstructions}</p>
      </div>
    </>
  );

  const reviewControls = (
    <PracticeCardReviewControls
      copy={copy}
      status={status}
      canRevealAnswer={false}
      isAnswerRevealed={false}
      onToggleAnswer={() => undefined}
      onContinue={status !== 'idle' ? onContinue : undefined}
    />
  );

  const answerSection = (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <p className="text-left text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/80">
          {b2Copy.wordBankLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {task.prompt.wordBankItems.map((phrase) => {
            const used = usedWordBankSet.has(phrase);
            return (
              <Button
                key={phrase}
                type="button"
                size="sm"
                variant="secondary"
                className={`rounded-full ${used ? 'opacity-60' : ''}`}
                onClick={() => handleWordBankInsert(phrase)}
                disabled={status !== 'idle' || isAnalyzing || isPersisting}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span>{phrase}</span>
                  {used ? <span aria-hidden>✓</span> : null}
                </span>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <Textarea
          value={responseText}
          onChange={(event) => setResponseText(event.target.value.slice(0, MAX_RESPONSE_LENGTH))}
          onKeyDown={handleKeyDown}
          placeholder={b2Copy.placeholder}
          aria-label={b2Copy.ariaLabel}
          rows={3}
          maxLength={MAX_RESPONSE_LENGTH}
          lang="de"
          spellCheck
          className="min-h-[120px] w-full bg-card/95 text-base text-foreground"
          disabled={status !== 'idle' || isAnalyzing || isPersisting}
        />
        <p className="text-right text-xs text-primary-foreground/70">
          {responseText.length} / {MAX_RESPONSE_LENGTH} Zeichen
        </p>
      </div>

      <Button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
        size="lg"
        className="h-12 w-full max-w-[min(80vw,24rem)] rounded-full"
      >
        <ActionButtonContent
          label={
            <span className="flex items-center gap-2">
              {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              <span>{b2Copy.submit}</span>
            </span>
          }
          hint={formatShortcutKey('Ctrl+Enter')}
        />
      </Button>

      {isAnalyzing ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-sm text-primary-foreground/80">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>{b2Copy.loadingAnalysis}</span>
        </div>
      ) : null}

      {feedback ? (
        <div className="space-y-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-4 text-left">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-primary-foreground">{b2Copy.feedbackLabel}</p>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getScoreBadgeClass(feedback.score)}`}
            >
              {b2Copy.scoreLabel} {feedback.score}
            </span>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-success-strong">
              {b2Copy.strengthsLabel}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-primary-foreground/90">
              {(feedback.strengths.length ? feedback.strengths : [b2Copy.noStrengths]).map((entry) => (
                <li key={entry} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-success-strong" aria-hidden />
                  <span>{entry}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-warning-strong">
              {b2Copy.improvementsLabel}
            </p>
            <ul className="mt-2 space-y-1 text-sm text-primary-foreground/90">
              {(feedback.improvements.length ? feedback.improvements : [b2Copy.noImprovements]).map((entry) => (
                <li key={entry} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-warning-strong" aria-hidden />
                  <span>{entry}</span>
                </li>
              ))}
            </ul>
          </div>

          {feedback.correctedSentence ? (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
                {b2Copy.correctionLabel}
              </p>
              <p className="mt-1 text-sm text-primary-foreground/90">{feedback.correctedSentence}</p>
            </div>
          ) : null}

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-foreground/70">
              {b2Copy.keyPhrasesLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {keyPhrases.map((phrase) => {
                const normalized = phrase.trim().toLocaleLowerCase();
                const found = keyPhraseSet.has(normalized) && feedbackFoundSet.has(normalized);
                return (
                  <span
                    key={phrase}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      found
                        ? 'border-success-border/60 bg-success-muted text-success-foreground'
                        : 'border-destructive/50 bg-destructive/10 text-destructive line-through'
                    }`}
                  >
                    {phrase}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {reviewControls}
      {onSkip ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full max-w-[min(80vw,20rem)] rounded-full"
          onClick={onSkip}
          disabled={!canSkip}
          aria-keyshortcuts="Escape"
        >
          <ActionButtonContent label={copy.actions.skip} hint={formatShortcutKey('Escape')} />
        </Button>
      ) : null}
    </div>
  );

  return (
    <PracticeCardScaffold
      copy={copy}
      sessionProgress={sessionProgress}
      prompt={promptSection}
      answerSection={answerSection}
      className={className}
      debugId={debugId}
      isLoadingNext={isLoadingNext}
      badgeLabel={task.lexeme.metadata?.level ? String(task.lexeme.metadata.level) : 'B2'}
    />
  );
}

