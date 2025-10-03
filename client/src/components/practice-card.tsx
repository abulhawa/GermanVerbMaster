import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, HelpCircle, Loader2, Volume2, XCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn, speak } from '@/lib/utils';
import type { PracticeTask } from '@/lib/tasks';
import { submitPracticeAttempt } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  type DebuggableComponentProps,
  getDevAttributes,
} from '@/lib/dev-attributes';
import type { CEFRLevel, PracticeResult, PracticeSettingsState } from '@shared';
import type { PracticeSettingsRendererPreferences, TaskType } from '@shared';

export interface PracticeCardResult {
  task: PracticeTask;
  result: PracticeResult;
  submittedResponse: unknown;
  expectedResponse?: unknown;
  promptSummary: string;
  timeSpentMs: number;
  answeredAt: string;
}

interface RendererProps<T extends TaskType = TaskType> extends DebuggableComponentProps {
  task: PracticeTask<T>;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
}

const DEFAULT_RENDERER_PREFS: PracticeSettingsRendererPreferences = {
  showHints: true,
  showExamples: true,
};

const CASE_LABELS: Record<string, string> = {
  nominative: 'Nominativ',
  accusative: 'Akkusativ',
  dative: 'Dativ',
  genitive: 'Genitiv',
};

const NUMBER_LABELS: Record<string, string> = {
  singular: 'Singular',
  plural: 'Plural',
};

const DEGREE_LABELS: Record<string, string> = {
  positive: 'Positiv',
  comparative: 'Komparativ',
  superlative: 'Superlativ',
};

function getRendererPreferences(
  settings: PracticeSettingsState,
  taskType: PracticeTask['taskType'],
): PracticeSettingsRendererPreferences {
  return settings.rendererPreferences[taskType] ?? DEFAULT_RENDERER_PREFS;
}

function normaliseAnswer(value: string): string {
  return value.trim().toLowerCase();
}

function buildPromptSummary(task: PracticeTask<'conjugate_form'>): string {
  const tense = task.prompt.requestedForm.tense;
  const tenseLabel =
    tense === 'participle'
      ? 'Partizip II'
      : tense === 'past'
        ? 'Präteritum'
        : tense === 'present'
          ? 'Präsens'
          : 'Form';
  return `${task.lexeme.lemma} – ${task.prompt.instructions || `Gib die ${tenseLabel}-Form an.`}`;
}

function buildNounPromptSummary(task: PracticeTask<'noun_case_declension'>): string {
  const caseLabel = CASE_LABELS[task.prompt.requestedCase] ?? task.prompt.requestedCase;
  const numberLabel = NUMBER_LABELS[task.prompt.requestedNumber] ?? task.prompt.requestedNumber;
  return `${task.lexeme.lemma} – ${caseLabel} ${numberLabel}`;
}

function buildAdjectivePromptSummary(task: PracticeTask<'adj_ending'>): string {
  const degreeLabel = DEGREE_LABELS[task.prompt.degree] ?? task.prompt.degree;
  return `${task.lexeme.lemma} – ${degreeLabel}`;
}

function toLegacyVerbPayload(
  task: PracticeTask<'conjugate_form'>,
  submitted: string,
): {
  infinitive: string;
  mode: 'präteritum' | 'partizipII';
  level?: CEFRLevel;
  attemptedAnswer: string;
} {
  const level = task.lexeme.metadata?.level as CEFRLevel | undefined;
  const mode: 'präteritum' | 'partizipII' =
    task.prompt.requestedForm.tense === 'past' ? 'präteritum' : 'partizipII';
  return {
    infinitive: task.lexeme.lemma,
    mode,
    level,
    attemptedAnswer: submitted,
  };
}

interface SubmissionContext {
  expectedForms: string[];
  result: PracticeResult;
  submitted: string;
  answeredAt: string;
  timeSpentMs: number;
}

function createSubmissionContext(expectedForms: string[], submitted: string): SubmissionContext {
  const normalizedSubmitted = normaliseAnswer(submitted);
  const correct = expectedForms.length === 0 ? false : expectedForms.includes(normalizedSubmitted);
  return {
    expectedForms,
    result: correct ? 'correct' : 'incorrect',
    submitted,
    answeredAt: new Date().toISOString(),
    timeSpentMs: 0,
  } satisfies SubmissionContext;
}

function computeAnsweredAtAndTime(context: SubmissionContext, startedAt: number): SubmissionContext {
  return {
    ...context,
    timeSpentMs: Date.now() - startedAt,
  };
}

function createOfflineToast(toast: ReturnType<typeof useToast>['toast']) {
  return () => {
    toast({
      title: 'Saved offline',
      description: "We'll sync this attempt once you're back online.",
    });
  };
}

function createErrorToast(toast: ReturnType<typeof useToast>['toast'], message: string) {
  toast({
    title: 'Error',
    description: message,
    variant: 'destructive',
  });
}

function renderStatusBadge(
  status: 'idle' | 'correct' | 'incorrect',
  expectedForms: string[],
  displayAnswer?: string,
) {
  const StatusIcon = status === 'correct' ? CheckCircle2 : status === 'incorrect' ? XCircle : null;
  const statusLabel = status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Try again' : null;

  if (!StatusIcon || !statusLabel) {
    return null;
  }

  return (
    <motion.div
      key={status}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
        status === 'correct'
          ? 'border-success-border/60 bg-success-muted text-success-foreground'
          : 'border-warning-border/60 bg-warning-muted text-warning-foreground',
      )}
      role="status"
      aria-live="assertive"
    >
      <StatusIcon className="h-5 w-5" aria-hidden />
      <div>
        <p className="font-semibold uppercase tracking-[0.22em]">{statusLabel}</p>
        {status === 'incorrect' && (displayAnswer || expectedForms.length > 0) && (
          <p className="text-xs normal-case text-muted-foreground">
            Erwartete Antwort:{' '}
            <span className="font-medium text-foreground">{displayAnswer ?? expectedForms[0]}</span>
          </p>
        )}
      </div>
    </motion.div>
  );
}

function renderExamples(example?: { de?: string; en?: string } | null): string | null {
  if (!example) {
    return null;
  }
  return [example.de, example.en].filter((value): value is string => Boolean(value)).join(' · ');
}

function renderHintText(
  preferences: PracticeSettingsRendererPreferences,
  exampleText: string | null,
  metadata: Record<string, unknown> | null,
  fallback?: string | null,
): string | null {
  if (!preferences.showHints) {
    return null;
  }

  const english = metadata && typeof metadata.english === 'string' ? metadata.english : null;
  if (english) {
    return `English: ${english}`;
  }

  if (preferences.showExamples && exampleText) {
    return exampleText;
  }

  if (fallback) {
    return fallback;
  }

  return null;
}

function renderMetadataRow(task: PracticeTask) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
      <span>CEFR {task.lexeme.metadata?.level ?? 'A1'}</span>
      <span aria-hidden>•</span>
      <span>Quelle: {task.source}</span>
    </div>
  );
}

function ConjugateFormRenderer({
  task,
  settings,
  onResult,
  className,
  debugId,
  isLoadingNext,
}: RendererProps<'conjugate_form'>) {
  const { toast } = useToast();
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTimeRef = useRef(Date.now());
  const preferences = getRendererPreferences(settings, task.taskType);

  useEffect(() => {
    setAnswer('');
    setStatus('idle');
    setShowHint(false);
    setIsSubmitting(false);
    startTimeRef.current = Date.now();
  }, [task.taskId]);

  const expectedForms = useMemo(() => {
    const forms = new Set<string>();
    const primary = task.expectedSolution && 'form' in task.expectedSolution ? task.expectedSolution.form : undefined;
    if (typeof primary === 'string') {
      forms.add(normaliseAnswer(primary));
    }
    const alternates =
      task.expectedSolution && 'alternateForms' in task.expectedSolution
        ? task.expectedSolution.alternateForms ?? []
        : [];
    for (const value of alternates ?? []) {
      if (typeof value === 'string' && value.trim()) {
        forms.add(normaliseAnswer(value));
      }
    }
    return Array.from(forms.values());
  }, [task.expectedSolution]);

  const exampleText = preferences.showExamples ? renderExamples(task.prompt.example ?? null) : null;
  const hintText = useMemo(() => {
    const fallback = expectedForms.length ? `Expected answer: ${task.expectedSolution?.form ?? ''}` : null;
    return renderHintText(preferences, exampleText, task.lexeme.metadata, fallback);
  }, [preferences, exampleText, task.lexeme.metadata, expectedForms, task.expectedSolution]);

  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'practice-card';
  const isLegacyTask = task.taskId.startsWith('legacy:verb:');

  const handlePronounce = () => {
    const formsToPronounce = [task.lexeme.lemma];
    if (status !== 'idle' && expectedForms.length) {
      formsToPronounce.push(task.expectedSolution?.form ?? task.lexeme.lemma);
    }
    speak(formsToPronounce[formsToPronounce.length - 1] ?? task.lexeme.lemma);
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

    try {
      const payload = {
        taskId: task.taskId,
        lexemeId: task.lexemeId,
        taskType: task.taskType,
        pos: task.pos,
        renderer: task.renderer,
        result: submissionContext.result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        timeSpentMs: submissionContext.timeSpentMs,
        answeredAt: submissionContext.answeredAt,
        cefrLevel: task.lexeme.metadata?.level as CEFRLevel | undefined,
        packId: task.pack?.id ?? null,
        legacyVerb: isLegacyTask ? toLegacyVerbPayload(task, submitted) : undefined,
      } as const;

      const { queued } = await submitPracticeAttempt(payload);

      setStatus(submissionContext.result);

      if (queued) {
        createOfflineToast(toast)();
      }

      onResult({
        task,
        result: submissionContext.result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        promptSummary: buildPromptSummary(task),
        timeSpentMs: submissionContext.timeSpentMs,
        answeredAt: submissionContext.answeredAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record practice attempt';
      createErrorToast(toast, message);
      setStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && status === 'idle') {
      void handleSubmit();
    }
  };

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border/70 bg-card/90 p-1 shadow-lg shadow-primary/5',
        className,
      )}
      data-testid="practice-card"
      {...getDevAttributes('practice-card', resolvedDebugId)}
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Badge
              variant="outline"
              className="rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary"
            >
              {task.pos.toUpperCase()}
            </Badge>
            <CardTitle className="text-3xl font-semibold text-foreground">{task.lexeme.lemma}</CardTitle>
          </div>
          {task.pack && (
            <Badge className="rounded-full bg-secondary/20 text-secondary" variant="secondary">
              {task.pack.name}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{task.prompt.instructions}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3">
          <Input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status !== 'idle' || isSubmitting}
            placeholder="Gib deine Antwort ein"
            aria-label="Antwort eingeben"
            autoFocus
            className="flex-1 rounded-2xl border-border/60 bg-background/90 text-lg"
          />
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={status !== 'idle' || isSubmitting || !answer.trim()}
            className="rounded-2xl px-5"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Prüfen'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handlePronounce}
            disabled={isSubmitting}
            className="rounded-full"
          >
            <Volume2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Aussprache abspielen</span>
          </Button>
        </div>

        {renderMetadataRow(task)}

        <AnimatePresence>
          {renderStatusBadge(status, expectedForms, task.expectedSolution?.form ?? undefined)}
        </AnimatePresence>

        {preferences.showExamples && exampleText && (
          <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Beispiel</p>
            <p className="mt-2 text-muted-foreground">{exampleText}</p>
          </div>
        )}

        {hintText && (
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/95 px-4 py-3 text-left text-sm text-muted-foreground transition hover:border-border"
            onClick={() => setShowHint((value) => !value)}
            aria-expanded={showHint}
          >
            <HelpCircle className="h-4 w-4" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em]">Hinweis</p>
              <AnimatePresence initial={false}>
                {showHint ? (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1 text-muted-foreground"
                  >
                    {hintText}
                  </motion.p>
                ) : (
                  <motion.span
                    key="toggle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-muted-foreground"
                  >
                    Tippe, um den Hinweis anzuzeigen
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </button>
        )}
      </CardContent>

      {isLoadingNext && (
        <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-background/70 backdrop-blur">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <span className="sr-only">Lädt nächste Aufgabe…</span>
        </div>
      )}
    </Card>
  );
}

function NounCaseDeclensionRenderer({
  task,
  settings,
  onResult,
  className,
  debugId,
  isLoadingNext,
}: RendererProps<'noun_case_declension'>) {
  const { toast } = useToast();
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTimeRef = useRef(Date.now());
  const preferences = getRendererPreferences(settings, task.taskType);

  useEffect(() => {
    setAnswer('');
    setStatus('idle');
    setShowHint(false);
    setIsSubmitting(false);
    startTimeRef.current = Date.now();
  }, [task.taskId]);

  const expectedForms = useMemo(() => {
    const forms = new Set<string>();
    const form = task.expectedSolution?.form;
    if (typeof form === 'string' && form.trim()) {
      forms.add(normaliseAnswer(form));
    }
    const article = task.expectedSolution?.article;
    if (typeof article === 'string' && article.trim() && form) {
      forms.add(normaliseAnswer(`${article} ${form}`));
    }
    return Array.from(forms.values());
  }, [task.expectedSolution]);

  const exampleText = preferences.showExamples ? renderExamples(task.prompt.example ?? null) : null;
  const genderHint = task.prompt.gender ? `Artikel: ${task.prompt.gender}` : null;
  const fallbackHint = expectedForms.length && task.expectedSolution?.form
    ? `Erwartete Form: ${task.expectedSolution.form}`
    : genderHint;
  const hintText = useMemo(() => {
    return renderHintText(preferences, exampleText, task.lexeme.metadata, fallbackHint);
  }, [preferences, exampleText, task.lexeme.metadata, fallbackHint]);
  const displayAnswer = useMemo(() => {
    if (!task.expectedSolution?.form) {
      return null;
    }
    const parts = [task.expectedSolution.article, task.expectedSolution.form]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value): value is string => Boolean(value));
    return parts.join(' ');
  }, [task.expectedSolution]);

  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'practice-card-noun';

  const handlePronounce = () => {
    const base = task.lexeme.lemma;
    const expected = displayAnswer ?? task.expectedSolution?.form ?? base;
    speak(status === 'idle' ? base : expected);
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

    try {
      const payload = {
        taskId: task.taskId,
        lexemeId: task.lexemeId,
        taskType: task.taskType,
        pos: task.pos,
        renderer: task.renderer,
        result: submissionContext.result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        timeSpentMs: submissionContext.timeSpentMs,
        answeredAt: submissionContext.answeredAt,
        cefrLevel: task.lexeme.metadata?.level as CEFRLevel | undefined,
        packId: task.pack?.id ?? null,
      } as const;

      const { queued } = await submitPracticeAttempt(payload);

      setStatus(submissionContext.result);

      if (queued) {
        createOfflineToast(toast)();
      }

      onResult({
        task,
        result: submissionContext.result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        promptSummary: buildNounPromptSummary(task),
        timeSpentMs: submissionContext.timeSpentMs,
        answeredAt: submissionContext.answeredAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record practice attempt';
      createErrorToast(toast, message);
      setStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && status === 'idle') {
      void handleSubmit();
    }
  };

  const caseLabel = CASE_LABELS[task.prompt.requestedCase] ?? task.prompt.requestedCase;
  const numberLabel = NUMBER_LABELS[task.prompt.requestedNumber] ?? task.prompt.requestedNumber;

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border/70 bg-card/90 p-1 shadow-lg shadow-primary/5',
        className,
      )}
      data-testid="practice-card"
      {...getDevAttributes('practice-card', resolvedDebugId)}
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Badge
              variant="outline"
              className="rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary"
            >
              {task.pos.toUpperCase()}
            </Badge>
            <CardTitle className="text-3xl font-semibold text-foreground">{task.lexeme.lemma}</CardTitle>
          </div>
          {task.pack && (
            <Badge className="rounded-full bg-secondary/20 text-secondary" variant="secondary">
              {task.pack.name}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{task.prompt.instructions}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full bg-secondary/15 text-xs uppercase tracking-[0.22em]">
            {caseLabel}
          </Badge>
          <Badge variant="secondary" className="rounded-full bg-secondary/15 text-xs uppercase tracking-[0.22em]">
            {numberLabel}
          </Badge>
          {task.prompt.gender && (
            <Badge variant="secondary" className="rounded-full bg-secondary/15 text-xs uppercase tracking-[0.22em]">
              {task.prompt.gender}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3">
          <Input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status !== 'idle' || isSubmitting}
            placeholder="z. B. die Kinder"
            aria-label="Pluralform eingeben"
            autoFocus
            className="flex-1 rounded-2xl border-border/60 bg-background/90 text-lg"
          />
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={status !== 'idle' || isSubmitting || !answer.trim()}
            className="rounded-2xl px-5"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Prüfen'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handlePronounce}
            disabled={isSubmitting}
            className="rounded-full"
          >
            <Volume2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Aussprache abspielen</span>
          </Button>
        </div>

        {renderMetadataRow(task)}

        <AnimatePresence>{renderStatusBadge(status, expectedForms, displayAnswer ?? undefined)}</AnimatePresence>

        {preferences.showExamples && exampleText && (
          <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Beispiel</p>
            <p className="mt-2 text-muted-foreground">{exampleText}</p>
          </div>
        )}

        {hintText && (
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/95 px-4 py-3 text-left text-sm text-muted-foreground transition hover:border-border"
            onClick={() => setShowHint((value) => !value)}
            aria-expanded={showHint}
          >
            <HelpCircle className="h-4 w-4" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em]">Hinweis</p>
              <AnimatePresence initial={false}>
                {showHint ? (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1 text-muted-foreground"
                  >
                    {hintText}
                  </motion.p>
                ) : (
                  <motion.span
                    key="toggle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-muted-foreground"
                  >
                    Tippe, um den Hinweis anzuzeigen
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </button>
        )}
      </CardContent>

      {isLoadingNext && (
        <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-background/70 backdrop-blur">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <span className="sr-only">Lädt nächste Aufgabe…</span>
        </div>
      )}
    </Card>
  );
}

function AdjectiveEndingRenderer({
  task,
  settings,
  onResult,
  className,
  debugId,
  isLoadingNext,
}: RendererProps<'adj_ending'>) {
  const { toast } = useToast();
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<'idle' | 'correct' | 'incorrect'>('idle');
  const [showHint, setShowHint] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const startTimeRef = useRef(Date.now());
  const preferences = getRendererPreferences(settings, task.taskType);

  useEffect(() => {
    setAnswer('');
    setStatus('idle');
    setShowHint(false);
    setIsSubmitting(false);
    startTimeRef.current = Date.now();
  }, [task.taskId]);

  const expectedForms = useMemo(() => {
    const forms = new Set<string>();
    const form = task.expectedSolution?.form;
    if (typeof form === 'string' && form.trim()) {
      forms.add(normaliseAnswer(form));
    }
    return Array.from(forms.values());
  }, [task.expectedSolution]);

  const exampleText = preferences.showExamples ? renderExamples(task.prompt.example ?? null) : null;
  const fallbackHint = expectedForms.length && task.expectedSolution?.form
    ? `Erwartete Form: ${task.expectedSolution.form}`
    : task.prompt.syntacticFrame ?? null;
  const hintText = useMemo(() => {
    return renderHintText(preferences, exampleText, task.lexeme.metadata, fallbackHint);
  }, [preferences, exampleText, task.lexeme.metadata, fallbackHint]);
  const displayAnswer = task.expectedSolution?.form ?? null;

  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'practice-card-adjective';

  const handlePronounce = () => {
    const expected = displayAnswer ?? task.lexeme.lemma;
    speak(status === 'idle' ? task.lexeme.lemma : expected);
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

    try {
      const payload = {
        taskId: task.taskId,
        lexemeId: task.lexemeId,
        taskType: task.taskType,
        pos: task.pos,
        renderer: task.renderer,
        result: submissionContext.result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        timeSpentMs: submissionContext.timeSpentMs,
        answeredAt: submissionContext.answeredAt,
        cefrLevel: task.lexeme.metadata?.level as CEFRLevel | undefined,
        packId: task.pack?.id ?? null,
      } as const;

      const { queued } = await submitPracticeAttempt(payload);

      setStatus(submissionContext.result);

      if (queued) {
        createOfflineToast(toast)();
      }

      onResult({
        task,
        result: submissionContext.result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        promptSummary: buildAdjectivePromptSummary(task),
        timeSpentMs: submissionContext.timeSpentMs,
        answeredAt: submissionContext.answeredAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record practice attempt';
      createErrorToast(toast, message);
      setStatus('idle');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && status === 'idle') {
      void handleSubmit();
    }
  };

  const degreeLabel = DEGREE_LABELS[task.prompt.degree] ?? task.prompt.degree;

  return (
    <Card
      className={cn(
        'relative overflow-hidden rounded-3xl border border-border/70 bg-card/90 p-1 shadow-lg shadow-primary/5',
        className,
      )}
      data-testid="practice-card"
      {...getDevAttributes('practice-card', resolvedDebugId)}
    >
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <Badge
              variant="outline"
              className="rounded-full border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary"
            >
              {task.pos.toUpperCase()}
            </Badge>
            <CardTitle className="text-3xl font-semibold text-foreground">{task.lexeme.lemma}</CardTitle>
          </div>
          {task.pack && (
            <Badge className="rounded-full bg-secondary/20 text-secondary" variant="secondary">
              {task.pack.name}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{task.prompt.instructions}</p>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full bg-secondary/15 text-xs uppercase tracking-[0.22em]">
            {degreeLabel}
          </Badge>
          {task.prompt.syntacticFrame && (
            <Badge variant="secondary" className="rounded-full bg-secondary/15 text-xs uppercase tracking-[0.22em]">
              Rahmen: {task.prompt.syntacticFrame}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3">
          <Input
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={status !== 'idle' || isSubmitting}
            placeholder="z. B. schneller"
            aria-label="Adjektivform eingeben"
            autoFocus
            className="flex-1 rounded-2xl border-border/60 bg-background/90 text-lg"
          />
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={status !== 'idle' || isSubmitting || !answer.trim()}
            className="rounded-2xl px-5"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : 'Prüfen'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handlePronounce}
            disabled={isSubmitting}
            className="rounded-full"
          >
            <Volume2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">Aussprache abspielen</span>
          </Button>
        </div>

        {renderMetadataRow(task)}

        <AnimatePresence>{renderStatusBadge(status, expectedForms, displayAnswer ?? undefined)}</AnimatePresence>

        {preferences.showExamples && exampleText && (
          <div className="rounded-2xl border border-border/60 bg-muted/40 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Beispiel</p>
            <p className="mt-2 text-muted-foreground">{exampleText}</p>
          </div>
        )}

        {hintText && (
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border/60 bg-background/95 px-4 py-3 text-left text-sm text-muted-foreground transition hover:border-border"
            onClick={() => setShowHint((value) => !value)}
            aria-expanded={showHint}
          >
            <HelpCircle className="h-4 w-4" aria-hidden />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em]">Hinweis</p>
              <AnimatePresence initial={false}>
                {showHint ? (
                  <motion.p
                    key="hint"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-1 text-muted-foreground"
                  >
                    {hintText}
                  </motion.p>
                ) : (
                  <motion.span
                    key="toggle"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-muted-foreground"
                  >
                    Tippe, um den Hinweis anzuzeigen
                  </motion.span>
                )}
              </AnimatePresence>
            </div>
          </button>
        )}
      </CardContent>

      {isLoadingNext && (
        <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-background/70 backdrop-blur">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <span className="sr-only">Lädt nächste Aufgabe…</span>
        </div>
      )}
    </Card>
  );
}

function UnsupportedRenderer({ task, debugId }: RendererProps) {
  return (
    <Card
      {...getDevAttributes('practice-card-unsupported', debugId ?? 'practice-card-unsupported')}
      className="rounded-3xl border border-border/70 bg-card/90 p-6 text-center shadow-lg shadow-primary/5"
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">Renderer fehlt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Für den Aufgabentyp <strong>{task.taskType}</strong> ist noch kein Renderer hinterlegt.
        </p>
        <p>Bitte versuche es später erneut.</p>
      </CardContent>
    </Card>
  );
}

export function PracticeCard(props: PracticeCardProps) {
  if (props.task.taskType === 'conjugate_form') {
    return <ConjugateFormRenderer {...props} />;
  }
  if (props.task.taskType === 'noun_case_declension') {
    return <NounCaseDeclensionRenderer {...props} />;
  }
  if (props.task.taskType === 'adj_ending') {
    return <AdjectiveEndingRenderer {...props} />;
  }
  return <UnsupportedRenderer {...props} />;
}

interface PracticeCardProps extends DebuggableComponentProps {
  task: PracticeTask;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
}
