import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, CornerDownLeft, HelpCircle, Loader2, Space as SpaceIcon, Volume2, XCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { useTranslations, formatUnsupportedRendererMessage, type PracticeCardMessages } from '@/locales';

export interface PracticeCardResult {
  task: PracticeTask;
  result: PracticeResult;
  submittedResponse: unknown;
  expectedResponse?: unknown;
  promptSummary: string;
  timeSpentMs: number;
  answeredAt: string;
}

interface PracticeCardSessionProgress {
  completed: number;
  target: number;
}

const DEFAULT_SESSION_PROGRESS: PracticeCardSessionProgress = {
  completed: 0,
  target: 10,
};

function formatPartOfSpeechLabel(task: PracticeTask): string {
  const base = task.pos ?? task.taskType;
  return base.replace(/[_-]+/g, ' ').toUpperCase();
}

interface RendererProps<T extends TaskType = TaskType> extends DebuggableComponentProps {
  task: PracticeTask<T>;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
  sessionProgress: PracticeCardSessionProgress;
  onContinue?: () => void;
  onSkip?: () => void;
}

const DEFAULT_RENDERER_PREFS: PracticeSettingsRendererPreferences = {
  showHints: true,
  showExamples: false,
};

function isTaskOfType<T extends TaskType>(task: PracticeTask, taskType: T): task is PracticeTask<T> {
  return task.taskType === taskType;
}

function getRendererPreferences(
  settings: PracticeSettingsState,
  taskType: PracticeTask['taskType'],
): PracticeSettingsRendererPreferences {
  return settings.rendererPreferences[taskType] ?? DEFAULT_RENDERER_PREFS;
}

function normaliseAnswer(value: string): string {
  return value.trim().toLowerCase();
}

const UMLAUT_FALLBACK_MAPPINGS = [
  ['ä', 'ae'],
  ['ö', 'oe'],
  ['ü', 'ue'],
  ['ß', 'ss'],
] as const;

function expandWithUmlautFallbacks(value: string): string[] {
  const normalized = normaliseAnswer(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  const queue: string[] = [normalized];

  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) {
      continue;
    }
    for (const [source, fallback] of UMLAUT_FALLBACK_MAPPINGS) {
      if (!current.includes(source)) {
        continue;
      }

      const replaced = current.replaceAll(source, fallback);
      if (!variants.has(replaced)) {
        variants.add(replaced);
        queue.push(replaced);
      }
    }
  }

  return Array.from(variants);
}

interface PracticeCardHotkeyOptions {
  status: 'idle' | 'correct' | 'incorrect';
  onContinue?: () => void;
  onToggleAnswer?: () => void;
  canRevealAnswer?: boolean;
  onRetry?: () => void;
  canRetry?: boolean;
  onPronounce?: () => void;
  canPronounce?: boolean;
  onToggleExample?: () => void;
  canToggleExample?: boolean;
  onSkip?: () => void;
  canSkip?: boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function usePracticeCardHotkeys({
  status,
  onContinue,
  onToggleAnswer,
  canRevealAnswer,
  onRetry,
  canRetry,
  onPronounce,
  canPronounce,
  onToggleExample,
  canToggleExample,
  onSkip,
  canSkip,
}: PracticeCardHotkeyOptions): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const isEditableTarget = Boolean(
        target && (target.isContentEditable || (target.tagName && EDITABLE_TAGS.has(target.tagName))),
      );
      const isButtonTarget = Boolean(target?.closest('button, [role="button"]'));

      const key = event.key;

      if (isEditableTarget && key !== 'Escape') {
        return;
      }

      if (status !== 'idle' && onContinue && key === 'ArrowRight') {
        event.preventDefault();
        onContinue();
        return;
      }

      if (status !== 'idle' && canRevealAnswer && onToggleAnswer && key === 'ArrowDown') {
        event.preventDefault();
        onToggleAnswer();
        return;
      }

      if (status === 'incorrect' && canRetry && onRetry && key === 'ArrowLeft') {
        event.preventDefault();
        onRetry();
        return;
      }

      if (
        canPronounce &&
        onPronounce &&
        (key === ' ' || key === 'Spacebar' || key === 'Space')
      ) {
        if (isButtonTarget) {
          return;
        }
        event.preventDefault();
        onPronounce();
        return;
      }

      if (canToggleExample && onToggleExample && key === 'ArrowUp') {
        event.preventDefault();
        onToggleExample();
        return;
      }

      if (status === 'idle' && canSkip && onSkip && key === 'Escape') {
        event.preventDefault();
        onSkip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    status,
    onContinue,
    onToggleAnswer,
    canRevealAnswer,
    onRetry,
    canRetry,
    onPronounce,
    canPronounce,
    onToggleExample,
    canToggleExample,
    onSkip,
  canSkip,
]); 
}

function useAnswerInputFocus(
  status: 'idle' | 'correct' | 'incorrect',
  isSubmitting: boolean,
  inputRef: React.RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    if (status === 'idle' && !isSubmitting) {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      const length = input.value.length;
      input.focus();
      if (typeof input.setSelectionRange === 'function') {
        input.setSelectionRange(length, length);
      } else {
        input.selectionStart = length;
        input.selectionEnd = length;
      }
    }
  }, [status, isSubmitting]);
}

function formatShortcutKey(key: string): ReactNode {
  const renderArrow = (symbol: string, description: string) => (
    <>
      <span aria-hidden className="text-xl leading-none">
        {symbol}
      </span>
      <span className="sr-only">{description}</span>
    </>
  );

  if (key === 'Enter') {
    return (
      <>
        <CornerDownLeft className="h-6 w-6" aria-hidden />
        <span className="sr-only">Enter</span>
      </>
    );
  }

  if (key === 'ArrowRight') {
    return renderArrow('→', 'Arrow Right');
  }

  if (key === 'ArrowLeft') {
    return renderArrow('←', 'Arrow Left');
  }

  if (key === 'ArrowUp') {
    return renderArrow('↑', 'Arrow Up');
  }

  if (key === 'ArrowDown') {
    return renderArrow('↓', 'Arrow Down');
  }

  if (key === 'Escape') {
    return 'Esc';
  }

  if (key === 'Space' || key === ' ') {
    return (
      <>
        <SpaceIcon className="h-6 w-6" aria-hidden />
        <span className="sr-only">Space</span>
      </>
    );
  }

  return key.length === 1 ? key.toUpperCase() : key;
}

function ActionButtonContent({ label, hint }: { label: ReactNode; hint?: ReactNode }) {
  return (
    <span className="flex w-full items-center justify-center gap-3 text-base font-semibold leading-tight text-inherit">
      <span className="flex items-center gap-2">
        {label}
      </span>
      {hint ? (
        <span className="inline-flex min-h-[1.25rem] min-w-[1.25rem] items-center justify-center text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-primary-foreground/70">
          {hint}
        </span>
      ) : null}
    </span>
  );
}

function addExpectedForm(forms: Set<string>, value: unknown): void {
  if (typeof value !== 'string') {
    return;
  }

  for (const variant of expandWithUmlautFallbacks(value)) {
    forms.add(variant);
  }
}

function getConjugateTenseLabel(copy: PracticeCardMessages, task: PracticeTask<'conjugate_form'>): string {
  const tense = task.prompt.requestedForm.tense;
  const { tenseLabels } = copy.conjugate;
  return tense === 'participle'
    ? tenseLabels.participle
    : tense === 'past'
      ? tenseLabels.past
      : tense === 'present'
        ? tenseLabels.present
        : tenseLabels.fallback;
}

function formatInstructionTemplate(template: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((result, [token, value]) => {
    return result.replaceAll(`{${token}}`, value);
  }, template);
}

function ensureSentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function getConjugateSubjectLabel(copy: PracticeCardMessages, task: PracticeTask<'conjugate_form'>): string | null {
  const { person, number } = task.prompt.requestedForm;
  if (!number || typeof person !== 'number') {
    return null;
  }

  const personIndex = person as 1 | 2 | 3;
  if (personIndex < 1 || personIndex > 3) {
    return copy.conjugate.subjectLabels.fallback ?? null;
  }

  const subjectLabels = copy.conjugate.subjectLabels[number];
  if (!subjectLabels) {
    return copy.conjugate.subjectLabels.fallback ?? null;
  }

  return subjectLabels[personIndex] ?? copy.conjugate.subjectLabels.fallback ?? null;
}

function buildConjugateInstruction(copy: PracticeCardMessages, task: PracticeTask<'conjugate_form'>): string {
  const tenseLabel = getConjugateTenseLabel(copy, task);
  const base = formatInstructionTemplate(copy.conjugate.instruction, {
    lemma: task.lexeme.lemma,
    tenseLabel,
  });
  const subjectLabel = getConjugateSubjectLabel(copy, task);
  if (!subjectLabel) {
    return ensureSentence(base);
  }

  const suffix = copy.conjugate.subjectSuffix
    ? formatInstructionTemplate(copy.conjugate.subjectSuffix, { subjectLabel })
    : ` ${subjectLabel}`;
  const punctuationMatch = base.match(/[.!?]$/);
  if (punctuationMatch) {
    const trimmedBase = base.slice(0, -punctuationMatch[0].length);
    return ensureSentence(`${trimmedBase}${suffix}${punctuationMatch[0]}`);
  }

  return ensureSentence(`${base}${suffix}`);
}

function buildNounInstruction(copy: PracticeCardMessages, task: PracticeTask<'noun_case_declension'>): string {
  const caseLabel = copy.caseLabels[task.prompt.requestedCase] ?? task.prompt.requestedCase;
  const numberLabel = copy.numberLabels[task.prompt.requestedNumber] ?? task.prompt.requestedNumber;
  const base = formatInstructionTemplate(copy.noun.instruction, {
    lemma: task.lexeme.lemma,
    caseLabel,
    numberLabel,
  });
  return ensureSentence(base);
}

function buildAdjectiveInstruction(copy: PracticeCardMessages, task: PracticeTask<'adj_ending'>): string {
  const degreeLabel = copy.degreeLabels[task.prompt.degree] ?? task.prompt.degree;
  const base = formatInstructionTemplate(copy.adjective.instruction, {
    lemma: task.lexeme.lemma,
    degreeLabel,
  });
  return ensureSentence(base);
}

function getTaskInstructions(copy: PracticeCardMessages, task: PracticeTask): string {
  switch (task.taskType) {
    case 'conjugate_form':
      return buildConjugateInstruction(copy, task as PracticeTask<'conjugate_form'>);
    case 'noun_case_declension':
      return buildNounInstruction(copy, task as PracticeTask<'noun_case_declension'>);
    case 'adj_ending':
      return buildAdjectiveInstruction(copy, task as PracticeTask<'adj_ending'>);
    default: {
      const instructions = (task.prompt as { instructions?: unknown }).instructions;
      return typeof instructions === 'string' && instructions.trim().length > 0 ? instructions : '';
    }
  }
}

function buildPromptSummary(copy: PracticeCardMessages, task: PracticeTask<'conjugate_form'>): string {
  const instructions = getTaskInstructions(copy, task);
  return `${task.lexeme.lemma} – ${instructions}`;
}

function buildNounPromptSummary(copy: PracticeCardMessages, task: PracticeTask<'noun_case_declension'>): string {
  const caseLabel = copy.caseLabels[task.prompt.requestedCase] ?? task.prompt.requestedCase;
  const numberLabel = copy.numberLabels[task.prompt.requestedNumber] ?? task.prompt.requestedNumber;
  return `${task.lexeme.lemma} – ${caseLabel} ${numberLabel}`;
}

function buildAdjectivePromptSummary(copy: PracticeCardMessages, task: PracticeTask<'adj_ending'>): string {
  const degreeLabel = copy.degreeLabels[task.prompt.degree] ?? task.prompt.degree;
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

function createOfflineToast(copy: PracticeCardMessages, toast: ReturnType<typeof useToast>['toast']) {
  const announce = copy.offline.announce || copy.offline.description;
  return () => {
    toast({
      title: (
        <span
          data-radix-toast-announce-exclude=""
          data-radix-toast-announce-alt={announce}
        >
          {copy.offline.title}
        </span>
      ),
      description: copy.offline.description,
    });
  };
}

function createErrorToast(
  copy: PracticeCardMessages,
  toast: ReturnType<typeof useToast>['toast'],
  message?: string,
) {
  toast({
    title: copy.error.title,
    description: message ?? copy.error.generic,
    variant: 'destructive',
  });
}

function renderStatusBadge(
  copy: PracticeCardMessages,
  status: 'idle' | 'correct' | 'incorrect',
  expectedForms: string[],
  displayAnswer: string | undefined,
  showAnswer: boolean,
) {
  const StatusIcon = status === 'correct' ? CheckCircle2 : status === 'incorrect' ? XCircle : null;
  const statusLabel = status === 'correct' ? copy.status.correct : status === 'incorrect' ? copy.status.incorrect : null;

  const hasAnswerToReveal = Boolean(displayAnswer ?? expectedForms[0]);
  const shouldShowAnswer = status === 'incorrect' && hasAnswerToReveal && showAnswer;
  const shouldShowRevealPrompt = status === 'incorrect' && hasAnswerToReveal && !showAnswer;

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
        'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm shadow-soft backdrop-blur',
        status === 'correct'
          ? 'border-success-border/60 bg-success-muted/80 text-success-foreground'
          : 'border-warning-border/60 bg-warning-muted/80 text-warning-foreground',
      )}
      role="status"
      aria-live="assertive"
    >
      <StatusIcon className="h-5 w-5" aria-hidden />
      <div>
        <p className="text-sm font-semibold text-primary-foreground">{statusLabel}</p>
        {shouldShowAnswer ? (
          <p className="text-xs normal-case text-primary-foreground/80">
            {copy.status.expectedAnswer}{' '}
            <span className="font-medium text-primary-foreground">{displayAnswer ?? expectedForms[0]}</span>
          </p>
        ) : null}
        {shouldShowRevealPrompt ? (
          <p className="text-xs normal-case text-primary-foreground/80">{copy.status.revealPrompt}</p>
        ) : null}
      </div>
    </motion.div>
  );
}

interface ExampleContent {
  de: string;
  en: string;
}

function resolveExampleContent(task: PracticeTask): ExampleContent | null {
  return (
    extractExampleFromCandidate(task.prompt?.example) ??
    extractExampleFromMetadata(task.lexeme?.metadata ?? null)
  );
}

function extractExampleFromMetadata(metadata: Record<string, unknown> | null | undefined): ExampleContent | null {
  if (!metadata) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  const direct = extractExampleFromCandidate(record.example as Record<string, unknown>);
  if (direct) {
    return direct;
  }

  const examples = record.examples;
  if (Array.isArray(examples)) {
    for (const entry of examples) {
      const resolved = extractExampleFromCandidate(entry as Record<string, unknown>);
      if (resolved) {
        return resolved;
      }
    }
  }

  const fallback = extractExampleFromCandidate({
    de: record.exampleDe ?? record.example_de,
    en: record.exampleEn ?? record.example_en,
  });
  if (fallback) {
    return fallback;
  }

  return null;
}

function extractExampleFromCandidate(candidate: unknown): ExampleContent | null {
  const record = toRecord(candidate);
  if (!record) {
    return null;
  }

  const german = pickFirstString(record, ['de', 'exampleDe', 'example_de', 'sentence']);
  const english =
    pickFirstString(record, ['en', 'exampleEn', 'example_en', 'translation']) ??
    pickFromTranslations(record.translations);

  if (german && english) {
    return { de: german, en: english };
  }

  return null;
}

function pickFromTranslations(value: unknown): string | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }
  return pickFirstString(record, ['en', 'english']);
}

function pickFirstString(source: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const candidate = normalizeSentence(source[key]);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeSentence(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function renderTranslationText(
  copy: PracticeCardMessages,
  preferences: PracticeSettingsRendererPreferences,
  metadata: Record<string, unknown> | null,
  fallback?: string | null,
): string | null {
  if (!preferences.showHints) {
    return null;
  }

  const english = metadata && typeof metadata.english === 'string' ? metadata.english : null;
  if (english) {
    return formatEnglishTranslation(english);
  }

  if (fallback) {
    return fallback;
  }

  return null;
}

function formatEnglishTranslation(value: string): string {
  const trimmed = value.trim();
  if (!/[,;]/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.join(' – ') || trimmed;
}

interface PracticeCardScaffoldProps extends DebuggableComponentProps {
  copy: PracticeCardMessages;
  sessionProgress: PracticeCardSessionProgress;
  prompt: ReactNode;
  answerSection: ReactNode;
  statusBadge?: ReactNode;
  supportSections?: ReactNode[];
  className?: string;
  isLoadingNext?: boolean;
  badgeLabel?: string;
}

interface PracticeCardReviewControlsProps {
  copy: PracticeCardMessages;
  status: 'idle' | 'correct' | 'incorrect';
  canRevealAnswer: boolean;
  isAnswerRevealed: boolean;
  onToggleAnswer: () => void;
  onRetry?: () => void;
  onContinue?: () => void;
}

function PracticeCardReviewControls({
  copy,
  status,
  canRevealAnswer,
  isAnswerRevealed,
  onToggleAnswer,
  onRetry,
  onContinue,
}: PracticeCardReviewControlsProps) {
  if (status === 'idle') {
    return null;
  }

  const revealLabel = isAnswerRevealed ? copy.actions.hideAnswer : copy.actions.revealAnswer;
  const revealHint = formatShortcutKey('ArrowDown');
  const retryHint = formatShortcutKey('ArrowLeft');
  const nextHint = formatShortcutKey('ArrowRight');

  return (
    <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
      {canRevealAnswer ? (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full max-w-[min(60vw,20rem)]"
          onClick={onToggleAnswer}
          aria-keyshortcuts="ArrowDown"
        >
          <ActionButtonContent label={revealLabel} hint={revealHint} />
        </Button>
      ) : null}
      {status === 'incorrect' && onRetry ? (
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="w-full max-w-[min(60vw,20rem)]"
          onClick={onRetry}
          aria-keyshortcuts="ArrowLeft"
        >
          <ActionButtonContent label={copy.actions.retry} hint={retryHint} />
        </Button>
      ) : null}
      {onContinue ? (
        <Button
          type="button"
          size="lg"
          className="w-full max-w-[min(60vw,20rem)]"
          onClick={onContinue}
          aria-keyshortcuts="ArrowRight"
        >
          <ActionButtonContent label={copy.actions.nextQuestion} hint={nextHint} />
        </Button>
      ) : null}
    </div>
  );
}

function PracticeCardScaffold({
  copy,
  sessionProgress,
  prompt,
  answerSection,
  statusBadge,
  supportSections = [],
  className,
  debugId,
  isLoadingNext,
  badgeLabel,
}: PracticeCardScaffoldProps) {
  const completedLabel = formatInstructionTemplate(copy.progress.completedLabel, {
    count: String(Math.max(sessionProgress.completed, 0)),
  });
  const supplementarySections = supportSections.filter(Boolean);
  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'practice-card';
  const resolvedBadgeLabel = badgeLabel && badgeLabel.trim().length > 0 ? badgeLabel : copy.header.appName;

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[32px] border border-primary/30 bg-gradient-to-b from-brand-gradient-start via-primary/80 to-brand-gradient-end text-primary-foreground shadow-2xl shadow-primary/25',
        className,
      )}
      data-testid="practice-card"
      {...getDevAttributes('practice-card', resolvedDebugId)}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-gradient-start via-primary/85 to-brand-gradient-end"
        aria-hidden
      />
      <div className="relative flex w-full flex-col gap-8 px-6 py-8 sm:px-10">
        <div className="pointer-events-none absolute inset-0 bg-card/25 backdrop-blur-md" aria-hidden />
        <div className="relative flex w-full flex-col items-center gap-8 text-center">
          <header className="flex w-full flex-wrap items-center justify-between gap-4 text-left">
            <span
              className="inline-flex items-center rounded-full bg-card/30 px-5 py-2 text-sm font-semibold uppercase tracking-[0.35em] text-primary-foreground/90"
              aria-label={copy.header.appName}
            >
              {resolvedBadgeLabel}
            </span>
          </header>
          <div className="flex w-full flex-col items-center gap-4 text-center">{prompt}</div>
          {statusBadge ? <div className="flex w-full justify-center">{statusBadge}</div> : null}
          <div className="w-full">{answerSection}</div>
          {supplementarySections.length > 0 ? <div className="w-full space-y-3">{supplementarySections}</div> : null}
          <footer className="flex w-full flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-primary-foreground/80 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-primary-foreground/70">{completedLabel}</span>
          </footer>
        </div>
      </div>
      {isLoadingNext ? (
        <div className="absolute inset-0 flex items-center justify-center rounded-[32px] bg-background/70 backdrop-blur">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <span className="sr-only">{copy.loadingNext}</span>
        </div>
      ) : null}
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

    try {
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

      const { queued } = await submitPracticeAttempt(payload);

      setStatus(submissionContext.result);

      if (queued) {
        createOfflineToast(copy, toast)();
      }

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
      const fallbackMessage = copy.error.generic;
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;
      createErrorToast(copy, toast, message);
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

  const displayAnswer = task.expectedSolution?.form ?? undefined;
  const canRevealAnswer = Boolean(displayAnswer || expectedForms.length > 0);
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

  const promptSection = (
    <>
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-primary-foreground/70">
        <span>{task.lexeme.lemma}</span>
        <span aria-hidden>•</span>
        <span>{task.pos.toUpperCase()}</span>
      </div>
      <p className="max-w-3xl text-4xl font-semibold leading-tight text-primary-foreground sm:text-5xl">
        {instructionText}
      </p>
      {translationText ? (
        <p className="max-w-3xl text-lg text-primary-foreground/80">{translationText}</p>
      ) : null}
    </>
  );

  const statusIndicator = (
    <AnimatePresence>
      {renderStatusBadge(copy, status, expectedForms, displayAnswer, isAnswerRevealed)}
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
      onContinue={onContinue}
    />
  );

  const enterHint = formatShortcutKey('Enter');
  const pronounceHint = formatShortcutKey('Space');
  const skipHint = formatShortcutKey('Escape');

  const answerSection = (
    <div className="flex flex-col items-center gap-6">
      <Input
        ref={inputRef}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={status !== 'idle' || isSubmitting}
        placeholder={copy.conjugate.placeholder}
        aria-label={copy.conjugate.ariaLabel}
        autoFocus
        className="h-14 w-full max-w-[min(80vw,32rem)] rounded-full border border-border/50 bg-card/95 px-6 text-lg text-foreground shadow-soft placeholder:text-muted-foreground/80 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      />
      <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
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

function NounCaseDeclensionRenderer({
  task,
  settings,
  onResult,
  className,
  debugId,
  isLoadingNext,
  sessionProgress,
  onContinue,
  onSkip,
}: RendererProps<'noun_case_declension'>) {
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
    const form = typeof task.expectedSolution?.form === 'string' ? task.expectedSolution.form : null;
    if (form && form.trim()) {
      addExpectedForm(forms, form);
      const article = task.expectedSolution?.article;
      if (typeof article === 'string' && article.trim()) {
        addExpectedForm(forms, `${article} ${form}`);
      }
    }
    return Array.from(forms.values());
  }, [task.expectedSolution]);

  const exampleContent = preferences.showExamples ? resolveExampleContent(task) : null;
  const genderTranslation = task.prompt.gender ? `${copy.translations.articleLabel} ${task.prompt.gender}` : null;
  const fallbackTranslation =
    expectedForms.length && task.expectedSolution?.form
      ? `${copy.translations.expectedFormPrefix} ${task.expectedSolution.form}`
      : genderTranslation;
  const translationText = useMemo(() => {
    return renderTranslationText(copy, preferences, task.lexeme.metadata, fallbackTranslation);
  }, [copy, preferences, task.lexeme.metadata, fallbackTranslation]);
  const displayAnswer = useMemo(() => {
    if (!task.expectedSolution?.form) {
      return null;
    }
    const parts = [task.expectedSolution.article, task.expectedSolution.form]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value): value is string => Boolean(value));
    return parts.join(' ');
  }, [task.expectedSolution]);

  const handlePronounce = () => {
    const base = task.lexeme.lemma;
    const expected = displayAnswer ?? task.expectedSolution?.form ?? base;
    speak(status === 'idle' ? base : expected);
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

    try {
      const promptSummary = buildNounPromptSummary(copy, task);
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
      } as const;

      const { queued } = await submitPracticeAttempt(payload);

      setStatus(submissionContext.result);

      if (queued) {
        createOfflineToast(copy, toast)();
      }

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
      const fallbackMessage = copy.error.generic;
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;
      createErrorToast(copy, toast, message);
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

  const caseLabel = copy.caseLabels[task.prompt.requestedCase] ?? task.prompt.requestedCase;
  const numberLabel = copy.numberLabels[task.prompt.requestedNumber] ?? task.prompt.requestedNumber;
  const canRevealAnswer = Boolean(displayAnswer || expectedForms.length > 0);
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

  const promptSection = (
    <>
      <h1 className="sr-only">{task.lexeme.lemma}</h1>
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-primary-foreground/70">
        <span>{task.lexeme.lemma}</span>
        <span aria-hidden>•</span>
        <span>{caseLabel}</span>
        <span aria-hidden>•</span>
        <span>{numberLabel}</span>
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
      {renderStatusBadge(copy, status, expectedForms, displayAnswer ?? undefined, isAnswerRevealed)}
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
      onContinue={onContinue}
    />
  );

  const enterHint = formatShortcutKey('Enter');
  const pronounceHint = formatShortcutKey('Space');
  const skipHint = formatShortcutKey('Escape');

  const answerSection = (
    <div className="flex flex-col items-center gap-6">
      <Input
        ref={inputRef}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={status !== 'idle' || isSubmitting}
        placeholder={copy.noun.placeholder}
        aria-label={copy.noun.ariaLabel}
        autoFocus
        className="h-14 w-full max-w-[min(80vw,32rem)] rounded-full border border-border/50 bg-card/95 px-6 text-lg text-foreground shadow-soft placeholder:text-muted-foreground/80 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      />
      <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
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

function AdjectiveEndingRenderer({
  task,
  settings,
  onResult,
  className,
  debugId,
  isLoadingNext,
  sessionProgress,
  onContinue,
  onSkip,
}: RendererProps<'adj_ending'>) {
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
    addExpectedForm(forms, task.expectedSolution?.form);
    return Array.from(forms.values());
  }, [task.expectedSolution]);

  const exampleContent = preferences.showExamples ? resolveExampleContent(task) : null;
  const fallbackTranslation =
    expectedForms.length && task.expectedSolution?.form
      ? `${copy.translations.expectedFormPrefix} ${task.expectedSolution.form}`
      : task.prompt.syntacticFrame ?? null;
  const translationText = useMemo(() => {
    return renderTranslationText(copy, preferences, task.lexeme.metadata, fallbackTranslation);
  }, [copy, preferences, task.lexeme.metadata, fallbackTranslation]);
  const displayAnswer = task.expectedSolution?.form ?? null;

  const handlePronounce = () => {
    const expected = displayAnswer ?? task.lexeme.lemma;
    speak(status === 'idle' ? task.lexeme.lemma : expected);
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

    try {
      const promptSummary = buildAdjectivePromptSummary(copy, task);
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
      } as const;

      const { queued } = await submitPracticeAttempt(payload);

      setStatus(submissionContext.result);

      if (queued) {
        createOfflineToast(copy, toast)();
      }

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
      const fallbackMessage = copy.error.generic;
      const message = error instanceof Error && error.message ? error.message : fallbackMessage;
      createErrorToast(copy, toast, message);
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

  const degreeLabel = copy.degreeLabels[task.prompt.degree] ?? task.prompt.degree;
  const canRevealAnswer = Boolean(displayAnswer || expectedForms.length > 0);
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

  const promptSection = (
    <>
      <h1 className="sr-only">{task.lexeme.lemma}</h1>
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs font-semibold uppercase tracking-[0.35em] text-primary-foreground/70">
        <span>{task.lexeme.lemma}</span>
        <span aria-hidden>•</span>
        <span>{degreeLabel}</span>
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
      {renderStatusBadge(copy, status, expectedForms, displayAnswer ?? undefined, isAnswerRevealed)}
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
      onContinue={onContinue}
    />
  );

  const enterHint = formatShortcutKey('Enter');
  const pronounceHint = formatShortcutKey('Space');
  const skipHint = formatShortcutKey('Escape');

  const answerSection = (
    <div className="flex flex-col items-center gap-6">
      <Input
        ref={inputRef}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={status !== 'idle' || isSubmitting}
        placeholder={copy.adjective.placeholder}
        aria-label={copy.adjective.ariaLabel}
        autoFocus
        className="h-14 w-full max-w-[min(80vw,32rem)] rounded-full border border-border/50 bg-card/95 px-6 text-lg text-foreground shadow-soft placeholder:text-muted-foreground/80 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
      />
      <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
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

function UnsupportedRenderer({ task, debugId }: RendererProps) {
  const { practiceCard: copy } = useTranslations();
  const description = formatUnsupportedRendererMessage(copy.unsupported.description, task.taskType);
  return (
    <Card
      {...getDevAttributes('practice-card-unsupported', debugId ?? 'practice-card-unsupported')}
      className="rounded-3xl border border-border/70 bg-card/90 p-6 text-center shadow-lg shadow-primary/5"
    >
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">{copy.unsupported.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>{description}</p>
        <p>{copy.unsupported.retry}</p>
      </CardContent>
    </Card>
  );
}

export function PracticeCard(props: PracticeCardProps) {
  const sessionProgress = props.sessionProgress ?? DEFAULT_SESSION_PROGRESS;

  if (isTaskOfType(props.task, 'conjugate_form')) {
    const rendererProps: RendererProps<'conjugate_form'> = {
      ...props,
      task: props.task,
      sessionProgress,
    };
    return <ConjugateFormRenderer {...rendererProps} />;
  }
  if (isTaskOfType(props.task, 'noun_case_declension')) {
    const rendererProps: RendererProps<'noun_case_declension'> = {
      ...props,
      task: props.task,
      sessionProgress,
    };
    return <NounCaseDeclensionRenderer {...rendererProps} />;
  }
  if (isTaskOfType(props.task, 'adj_ending')) {
    const rendererProps: RendererProps<'adj_ending'> = {
      ...props,
      task: props.task,
      sessionProgress,
    };
    return <AdjectiveEndingRenderer {...rendererProps} />;
  }
  const rendererProps: RendererProps = {
    ...props,
    sessionProgress,
  };
  return <UnsupportedRenderer {...rendererProps} />;
}

interface PracticeCardProps extends DebuggableComponentProps {
  task: PracticeTask;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
  sessionProgress?: PracticeCardSessionProgress;
  onContinue?: () => void;
  onSkip?: () => void;
}
