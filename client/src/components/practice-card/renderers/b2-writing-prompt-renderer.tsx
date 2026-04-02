import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { submitPracticeAttempt } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { useTranslations } from '@/locales';
import type { CEFRLevel } from '@shared';

import { ActionButtonContent, formatShortcutKey } from '../components/action-button-content';
import { PracticeCardReviewControls } from '../components/practice-card-review-controls';
import { PracticeCardScaffold } from '../components/practice-card-scaffold';
import { usePracticeCardHotkeys } from '../hooks/use-practice-card-hotkeys';
import type { RendererProps } from '../types';
import { createErrorToast, createOfflineToast } from '../utils/data';

function countSentences(value: string): number {
  return value
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length > 0).length;
}

function formatTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((message, [token, value]) => {
    return message.replaceAll(`{${token}}`, value);
  }, template);
}

function getMatchedPhrases(response: string, keyPhrases: string[]): string[] {
  const normalizedResponse = response.trim().toLocaleLowerCase();
  if (!normalizedResponse || keyPhrases.length === 0) {
    return [];
  }

  return keyPhrases.filter((phrase) => normalizedResponse.includes(phrase.toLocaleLowerCase()));
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGrammarFocus, setShowGrammarFocus] = useState(false);
  const startTimeRef = useRef(Date.now());

  useEffect(() => {
    setResponseText('');
    setStatus('idle');
    setShowGrammarFocus(false);
    setIsSubmitting(false);
    startTimeRef.current = Date.now();
  }, [task.taskId]);

  const keyPhrases = task.expectedSolution?.keyPhrases ?? [];
  const matchedPhrases = useMemo(
    () => getMatchedPhrases(responseText, keyPhrases),
    [responseText, keyPhrases],
  );
  const hasSentenceRequirement = countSentences(responseText) >= 2;

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

  const handleWordBankInsert = (phrase: string) => {
    setResponseText((previous) => {
      const spacer = previous.trim().length > 0 ? ' ' : '';
      return `${previous}${spacer}${phrase}`.trimStart();
    });
  };

  const handleSubmit = async () => {
    if (isSubmitting || status !== 'idle' || !hasSentenceRequirement) {
      return;
    }

    const submitted = responseText.trim();
    if (!submitted) {
      return;
    }

    const matchRatio = keyPhrases.length > 0 ? matchedPhrases.length / keyPhrases.length : 0;
    const result = matchRatio >= 0.5 ? 'correct' : 'incorrect';
    const answeredAt = new Date().toISOString();
    const timeSpentMs = Date.now() - startTimeRef.current;
    const promptSummary = `${task.prompt.scenario} ${task.prompt.taskInstructions}`.trim();

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

    setIsSubmitting(true);
    setStatus(result);
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
      // ignore parent callback exceptions
    }

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
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const canSkip = Boolean(onSkip) && !isSubmitting && status === 'idle';

  usePracticeCardHotkeys({
    status,
    onContinue,
    onSkip,
    canSkip,
  });

  const promptSection = (
    <>
      <h1 className="sr-only">{task.lexeme.lemma}</h1>
      <div className="w-full max-w-3xl rounded-2xl border border-warning-border/70 bg-warning-muted px-4 py-3 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-warning-strong">
          {b2Copy.scenarioLabel}
        </p>
        <p className="mt-2 text-sm text-warning-muted-foreground">{task.prompt.scenario}</p>
      </div>
      <h2 className="max-w-3xl text-3xl font-semibold leading-tight text-primary-foreground sm:text-4xl">
        {task.prompt.taskInstructions}
      </h2>
    </>
  );

  const answerSection = (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <p className="text-left text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/80">
          {b2Copy.wordBankLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          {task.prompt.wordBankItems.map((phrase) => (
            <Button
              key={phrase}
              type="button"
              size="sm"
              variant="secondary"
              className="rounded-full"
              onClick={() => handleWordBankInsert(phrase)}
              disabled={status !== 'idle' || isSubmitting}
            >
              {phrase}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-left text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/80">
          {b2Copy.responseLabel}
        </p>
        <Textarea
          value={responseText}
          onChange={(event) => setResponseText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={b2Copy.placeholder}
          aria-label={b2Copy.ariaLabel}
          className="min-h-[150px] bg-card/95 text-base text-foreground"
          disabled={status !== 'idle' || isSubmitting}
        />
        {!hasSentenceRequirement && status === 'idle' ? (
          <p className="text-left text-xs text-warning-strong">{b2Copy.sentenceRequirement}</p>
        ) : null}
      </div>

      <Collapsible open={showGrammarFocus} onOpenChange={setShowGrammarFocus}>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" className="w-fit">
            {showGrammarFocus ? b2Copy.hideGrammarFocus : b2Copy.showGrammarFocus}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-left text-sm text-primary-foreground/90">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
            {b2Copy.grammarFocusLabel}
          </p>
          <p className="mt-1">{task.expectedSolution?.grammarFocus}</p>
        </CollapsibleContent>
      </Collapsible>

      <Button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={status !== 'idle' || isSubmitting || !hasSentenceRequirement || !responseText.trim()}
        size="lg"
        className="h-12 w-full max-w-[min(80vw,24rem)] rounded-full"
      >
        <ActionButtonContent
          label={
            <span className="flex items-center gap-2">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              <span>{b2Copy.submit}</span>
            </span>
          }
          hint={formatShortcutKey('Ctrl+Enter')}
        />
      </Button>

      {status !== 'idle' ? (
        <div className="rounded-2xl border border-border/60 bg-card/80 px-4 py-3 text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
            {b2Copy.modelAnswerLabel}
          </p>
          <p className="mt-1 text-sm text-primary-foreground/80">
            {formatTemplate(b2Copy.matchSummary, {
              matched: String(matchedPhrases.length),
              total: String(keyPhrases.length),
            })}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {keyPhrases.map((phrase) => {
              const matched = matchedPhrases.includes(phrase);
              return (
                <li key={phrase} className={matched ? 'text-success-strong' : 'text-primary-foreground/80'}>
                  {phrase}
                </li>
              );
            })}
          </ul>
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
