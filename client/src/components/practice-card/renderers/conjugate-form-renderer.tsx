import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { HelpCircle, Loader2, Volume2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { submitPracticeAttempt } from '@/lib/api';
import { speak } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/locales';
import type { CEFRLevel } from '@shared';

import { ActionButtonContent, formatShortcutKey } from '../components/action-button-content';
import { PracticeCardReviewControls } from '../components/practice-card-review-controls';
import { PracticeCardScaffold } from '../components/practice-card-scaffold';
import { PracticeStatusBadge } from '../components/practice-status-badge';
import { useAnswerInputFocus } from '../hooks/use-answer-input-focus';
import { usePracticeCardHotkeys } from '../hooks/use-practice-card-hotkeys';
import type { RendererProps } from '../types';
import {
  buildPromptSummary,
  createErrorToast,
  createOfflineToast,
  getRendererPreferences,
  getTaskInstructions,
  renderTranslationText,
  resolveExampleContent,
  toLegacyVerbPayload,
} from '../utils/data';
import { addExpectedForm, computeAnsweredAtAndTime, createSubmissionContext } from '../utils/scoring';
import { formatPartOfSpeechLabel } from '../utils/format';

export function ConjugateFormRenderer({
  task,
  settings,
  onResult,
  className,
  debugId,
  isLoadingNext,
  sessionProgress,
  onContinue,
  onSkip,
}: RendererProps<'conjugate_form'>) {
  const { toast } = useToast();
  const { practiceCard: copy } = useTranslations();
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [showExample, setShowExample] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAnswerRevealed, setIsAnswerRevealed] = useState(false);
  const toggleExample = useCallback(() => {
    setShowExample((value) => !value);
  }, []);
  const startTimeRef = useRef(Date.now());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const preferences = getRendererPreferences(settings, task.taskType);
  const instructionText = useMemo(() => getTaskInstructions(copy, task), [copy, task]);
  const partOfSpeechLabel = useMemo(() => formatPartOfSpeechLabel(task), [task.pos, task.taskType]);

  useEffect(() => {
    setAnswer('');
    setStatus('idle');
    setShowExample(false);
    setIsSubmitting(false);
    setIsAnswerRevealed(false);
    startTimeRef.current = Date.now();
  }, [task.taskId]);

  const expectedForms = useMemo(() => {
    const forms = new Set<string>();
    const primary = task.expectedSolution && 'form' in task.expectedSolution ? task.expectedSolution.form : undefined;
    addExpectedForm(forms, primary);
    const alternates =
      task.expectedSolution && 'alternateForms' in task.expectedSolution
        ? task.expectedSolution.alternateForms ?? []
        : [];
    for (const value of alternates ?? []) {
      addExpectedForm(forms, value);
    }
    return Array.from(forms.values());
  }, [task.expectedSolution]);

  const exampleContent = preferences.showExamples ? resolveExampleContent(task) : null;
  const translationText = useMemo(() => {
    const fallback =
      expectedForms.length && task.expectedSolution?.form
        ? `${copy.translations.expectedAnswerPrefix} ${task.expectedSolution.form}`
        : null;
    return renderTranslationText(copy, preferences, task.lexeme.metadata, fallback);
  }, [copy, preferences, task.lexeme.metadata, expectedForms, task.expectedSolution]);

  const isLegacyTask = task.taskId.startsWith('legacy:verb:');

  const handlePronounce = () => {
    const formsToPronounce = [task.lexeme.lemma];
    if (status !== 'idle' && expectedForms.length) {
      formsToPronounce.push(task.expectedSolution?.form ?? task.lexeme.lemma);
    }
    speak(formsToPronounce[formsToPronounce.length - 1] ?? task.lexeme.lemma);
  };

  const handleToggleAnswerReveal = () => {
    setIsAnswerRevealed((previous) => !previous);
  };

  const handleRetry = () => {
    if (isSubmitting) {
      return;
    }

    setStatus('idle');
    setIsAnswerRevealed(false);
    startTimeRef.current = Date.now();
    inputRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!answer.trim() || isSubmitting) {
      return;
    }

    const submitted = answer.trim();
    const submissionContext = computeAnsweredAtAndTime(
      createSubmissionContext(expectedForms, submitted),
      startTimeRef.current,
    );

    setIsSubmitting(true);
    setIsAnswerRevealed(false);

    const promptSummary = buildPromptSummary(copy, task);
    const payload = {
      taskId: task.taskId,
      lexemeId: task.lexemeId,
      taskType: task.taskType,
      pos: task.pos,
      renderer: task.renderer,
      result: submissionContext.result,
      submittedResponse: submitted,
      expectedResponse: task.expectedSolution,
      promptSummary,
      timeSpentMs: submissionContext.timeSpentMs,
      answeredAt: submissionContext.answeredAt,
      cefrLevel: task.lexeme.metadata?.level as CEFRLevel | undefined,
      legacyVerb: isLegacyTask ? toLegacyVerbPayload(task, submitted) : undefined,
    } as const;

    // Optimistic UI update: show result and notify parent immediately
    setStatus(submissionContext.result);
    try {
      onResult({
        task,
        result: submissionContext.result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        promptSummary,
        timeSpentMs: submissionContext.timeSpentMs,
        answeredAt: submissionContext.answeredAt,
      });
    } catch (error) {
      // swallow - parent may throw in rare cases; ensure we still attempt submission
    }

    // Fire-and-forget submission; UI already updated for perceived speed.
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
        // revert status to idle on hard failures so user can retry
        setStatus('idle');
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && status === 'idle') {
      void handleSubmit();
    }
  };

  const canRevealAnswer = Boolean(expectedForms.length > 0 || task.expectedSolution?.form);
  const canToggleExample = Boolean(preferences.showExamples && exampleContent);
  const canSkip = Boolean(onSkip) && !isSubmitting && status === 'idle';

  usePracticeCardHotkeys({
    status,
    onContinue,
    onToggleAnswer: canRevealAnswer ? handleToggleAnswerReveal : undefined,
    canRevealAnswer,
    onRetry: status === 'incorrect' ? handleRetry : undefined,
    canRetry: status === 'incorrect',
    onPronounce: handlePronounce,
    canPronounce: true,
    onToggleExample: canToggleExample ? toggleExample : undefined,
    canToggleExample,
    onSkip,
    canSkip,
  });
  useAnswerInputFocus(status, isSubmitting, inputRef);

  const enterHint = formatShortcutKey('Enter');
  const pronounceHint = formatShortcutKey('Space');
  const skipHint = formatShortcutKey('Escape');

  const promptSection = (
    <>
      <h1 className="sr-only">{task.lexeme.lemma}</h1>
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-primary-foreground/70">
        <span>{task.lexeme.lemma}</span>
        <span aria-hidden>•</span>
        <span>{partOfSpeechLabel}</span>
      </div>
      <h2 className="max-w-3xl text-4xl font-semibold leading-tight text-primary-foreground sm:text-5xl">
        {instructionText}
      </h2>
      {translationText ? (
        <p className="max-w-3xl text-lg text-primary-foreground/80">{translationText}</p>
      ) : null}
    </>
  );

  const statusIndicator = (
    <AnimatePresence>
      <PracticeStatusBadge
        copy={copy}
        status={status}
        expectedForms={expectedForms}
        displayAnswer={task.expectedSolution?.form ?? undefined}
        showAnswer={isAnswerRevealed}
      />
    </AnimatePresence>
  );

  const reviewControls = (
    <PracticeCardReviewControls
      copy={copy}
      status={status}
      canRevealAnswer={canRevealAnswer}
      isAnswerRevealed={isAnswerRevealed}
      onToggleAnswer={handleToggleAnswerReveal}
      onRetry={status === 'incorrect' ? handleRetry : undefined}
      onContinue={status !== 'idle' ? onContinue : undefined}
    />
  );

  const answerSection = (
    <div className="flex flex-col items-center gap-6">
      <Input
        ref={inputRef}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={copy.conjugate.placeholder}
        aria-label={copy.conjugate.ariaLabel}
        autoFocus
        className="h-14 w-full max-w-[min(80vw,32rem)] rounded-full border border-border/50 bg-card/95 px-6 text-lg text-foreground shadow-soft placeholder:text-muted-foreground/80 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        disabled={status !== 'idle' || isSubmitting}
      />
      <div className="flex w-full max-w-[min(60vw,24rem)] items-center justify-center gap-3">
        <Button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={status !== 'idle' || isSubmitting || !answer.trim()}
          size="lg"
          className="h-14 w-full max-w-[min(60vw,24rem)] rounded-full text-base shadow-soft shadow-primary/30"
          aria-keyshortcuts="Enter"
        >
          <ActionButtonContent
            label={
              <span className="flex items-center gap-2">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                <span>{copy.actions.submit}</span>
              </span>
            }
            hint={enterHint}
          />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={handlePronounce}
          disabled={isSubmitting}
          className="flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-full border border-border/40 bg-card/30 text-primary-foreground transition hover:bg-card/40 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          aria-keyshortcuts="Space"
        >
          <Volume2 className="h-5 w-5" aria-hidden />
          <span className="sr-only">{copy.actions.pronounceSrLabel}</span>
          <span
            aria-hidden
            className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-primary-foreground/70"
          >
            {pronounceHint}
          </span>
        </Button>
      </div>
      {reviewControls}
      {onSkip ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-12 w-full max-w-[min(60vw,20rem)] rounded-full border-border/70 bg-card/90 text-base shadow-soft transition hover:bg-card focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
          onClick={onSkip}
          disabled={!canSkip}
          aria-keyshortcuts="Escape"
        >
          <ActionButtonContent label={copy.actions.skip} hint={skipHint} />
        </Button>
      ) : null}
    </div>
  );

  const supportSections: ReactNode[] = [];

  if (preferences.showExamples && exampleContent) {
    supportSections.push(
      <button
        key="example"
        type="button"
        className="flex w-full items-start gap-3 rounded-2xl border border-border/40 bg-card/20 px-4 py-3 text-left text-sm text-primary-foreground/90 transition hover:bg-card/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        onClick={toggleExample}
        aria-expanded={showExample}
        aria-keyshortcuts="ArrowUp"
      >
        <HelpCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary-foreground" aria-hidden />
        <div className="flex w-full items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary-foreground">{copy.exampleLabel}</p>
            <AnimatePresence initial={false}>
              {showExample ? (
                <motion.div
                  key="example-content"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1 text-primary-foreground"
                >
                  <p className="text-sm font-semibold">{exampleContent.de}</p>
                  <p className="text-sm text-primary-foreground/80">{exampleContent.en}</p>
                </motion.div>
              ) : (
                <motion.span
                  key="example-toggle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-xs text-primary-foreground/70"
                >
                  {copy.exampleToggle}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <span
            aria-hidden
            className="mt-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-primary-foreground/60"
          >
            {formatShortcutKey('ArrowUp')}
          </span>
        </div>
      </button>,
    );
  }

  return (
    <PracticeCardScaffold
      copy={copy}
      sessionProgress={sessionProgress}
      prompt={promptSection}
      answerSection={answerSection}
      statusBadge={statusIndicator}
      supportSections={supportSections}
      className={className}
      debugId={debugId}
      isLoadingNext={isLoadingNext}
      badgeLabel={partOfSpeechLabel}
    />
  );
}
