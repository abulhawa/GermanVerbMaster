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
import type { PracticeSettingsRendererPreferences } from '@shared';

export interface PracticeCardResult {
  task: PracticeTask;
  result: PracticeResult;
  submittedResponse: unknown;
  expectedResponse?: unknown;
  promptSummary: string;
  timeSpentMs: number;
  answeredAt: string;
}

interface PracticeCardProps extends DebuggableComponentProps {
  task: PracticeTask;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
}

interface RendererProps extends DebuggableComponentProps {
  task: PracticeTask;
  settings: PracticeSettingsState;
  onResult: (result: PracticeCardResult) => void;
  isLoadingNext?: boolean;
  className?: string;
}

const DEFAULT_RENDERER_PREFS: PracticeSettingsRendererPreferences = {
  showHints: true,
  showExamples: true,
};

function getRendererPreferences(
  settings: PracticeSettingsState,
  taskType: PracticeTask['taskType'],
): PracticeSettingsRendererPreferences {
  return settings.rendererPreferences[taskType] ?? DEFAULT_RENDERER_PREFS;
}

function getVerbModeFromPrompt(task: PracticeTask<'conjugate_form'>): 'präteritum' | 'partizipII' {
  if (task.prompt.requestedForm.tense === 'past') {
    return 'präteritum';
  }
  return 'partizipII';
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
  return {
    infinitive: task.lexeme.lemma,
    mode: getVerbModeFromPrompt(task),
    level,
    attemptedAnswer: submitted,
  };
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

function ConjugateFormRenderer({
  task,
  settings,
  onResult,
  className,
  debugId,
  isLoadingNext,
}: RendererProps) {
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
      forms.add(primary.trim().toLowerCase());
    }
    const alternates =
      task.expectedSolution && 'alternateForms' in task.expectedSolution
        ? task.expectedSolution.alternateForms ?? []
        : [];
    for (const value of alternates ?? []) {
      if (typeof value === 'string' && value.trim()) {
        forms.add(value.trim().toLowerCase());
      }
    }
    return Array.from(forms.values());
  }, [task.expectedSolution]);

  const exampleText =
    preferences.showExamples && task.prompt.example
      ? [task.prompt.example.de, task.prompt.example.en]
          .filter((value): value is string => Boolean(value))
          .join(' · ')
      : null;

  const hintText = useMemo(() => {
    if (!preferences.showHints) {
      return null;
    }
    const metadata = task.lexeme.metadata ?? {};
    const english = typeof metadata.english === 'string' ? metadata.english : undefined;
    if (english) {
      return `English: ${english}`;
    }
    if (preferences.showExamples && exampleText) {
      return exampleText;
    }
    if (expectedForms.length) {
      return `Expected answer: ${expectedForms[0]}`;
    }
    return null;
  }, [preferences.showHints, preferences.showExamples, task.lexeme.metadata, exampleText, expectedForms]);

  const resolvedDebugId = debugId && debugId.trim().length > 0 ? debugId : 'practice-card';
  const isLegacyTask = task.taskId.startsWith('legacy:verb:');

  const handlePronounce = () => {
    const formsToPronounce = [task.lexeme.lemma];
    if (status !== 'idle' && expectedForms.length) {
      formsToPronounce.push(expectedForms[0] ?? task.lexeme.lemma);
    }
    speak(formsToPronounce[formsToPronounce.length - 1] ?? task.lexeme.lemma);
  };

  const handleSubmit = async () => {
    if (!answer.trim() || isSubmitting) {
      return;
    }

    const submitted = answer.trim();
    const normalized = submitted.toLowerCase();
    const correct = expectedForms.length === 0 ? false : expectedForms.includes(normalized);
    const result: PracticeResult = correct ? 'correct' : 'incorrect';
    const timeSpentMs = Date.now() - startTimeRef.current;
    const answeredAt = new Date().toISOString();

    setIsSubmitting(true);

    try {
      const payload = {
        taskId: task.taskId,
        lexemeId: task.lexemeId,
        taskType: task.taskType,
        pos: task.pos,
        renderer: task.renderer,
        result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        timeSpentMs,
        answeredAt,
        cefrLevel: task.lexeme.metadata?.level as CEFRLevel | undefined,
        packId: task.pack?.id ?? null,
        legacyVerb: isLegacyTask ? toLegacyVerbPayload(task, submitted) : undefined,
      } as const;

      const { queued } = await submitPracticeAttempt(payload);

      setStatus(correct ? 'correct' : 'incorrect');

      if (queued) {
        toast({
          title: 'Saved offline',
          description: "We'll sync this attempt once you're back online.",
        });
      }

      onResult({
        task,
        result,
        submittedResponse: submitted,
        expectedResponse: task.expectedSolution,
        promptSummary: buildPromptSummary(task),
        timeSpentMs,
        answeredAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to record practice attempt';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
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

  const statusIcon = status === 'correct' ? CheckCircle2 : status === 'incorrect' ? XCircle : null;
  const statusLabel = status === 'correct' ? 'Correct' : status === 'incorrect' ? 'Try again' : null;

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

        <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
          <span>CEFR {task.lexeme.metadata?.level ?? 'A1'}</span>
          <span aria-hidden>•</span>
          <span>Quelle: {task.source}</span>
        </div>

        <AnimatePresence>
          {status !== 'idle' && statusIcon && statusLabel && (
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
              <statusIcon className="h-5 w-5" aria-hidden />
              <div>
                <p className="font-semibold uppercase tracking-[0.22em]">{statusLabel}</p>
                {status === 'incorrect' && expectedForms.length > 0 && (
                  <p className="text-xs normal-case text-muted-foreground">
                    Erwartete Antwort: <span className="font-medium text-foreground">{expectedForms[0]}</span>
                  </p>
                )}
              </div>
            </motion.div>
          )}
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
  return <UnsupportedRenderer {...props} />;
}

