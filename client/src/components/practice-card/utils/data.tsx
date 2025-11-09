import type { PracticeTask } from '@/lib/tasks';
import type { PracticeCardMessages } from '@/locales';
import type { PracticeSettingsRendererPreferences, PracticeSettingsState, TaskType, CEFRLevel } from '@shared';
import type { useToast } from '@/hooks/use-toast';

import type { PracticeCardSessionProgress } from '../types';
import { ensureSentence, formatEnglishTranslation, formatInstructionTemplate } from './format';

export const DEFAULT_RENDERER_PREFS: PracticeSettingsRendererPreferences = {
  showHints: true,
  showExamples: false,
};

export const DEFAULT_SESSION_PROGRESS: PracticeCardSessionProgress = {
  completed: 0,
  target: 10,
};

export function isTaskOfType<T extends TaskType>(task: PracticeTask, taskType: T): task is PracticeTask<T> {
  return task.taskType === taskType;
}

export function getRendererPreferences(
  settings: PracticeSettingsState,
  taskType: PracticeTask['taskType'],
): PracticeSettingsRendererPreferences {
  return settings.rendererPreferences[taskType] ?? DEFAULT_RENDERER_PREFS;
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

function getConjugateSubjectLabel(
  copy: PracticeCardMessages,
  task: PracticeTask<'conjugate_form'>,
): string | null {
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

export function buildConjugateInstruction(copy: PracticeCardMessages, task: PracticeTask<'conjugate_form'>): string {
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

export function buildNounInstruction(copy: PracticeCardMessages, task: PracticeTask<'noun_case_declension'>): string {
  const caseLabel = copy.caseLabels[task.prompt.requestedCase] ?? task.prompt.requestedCase;
  const numberLabel = copy.numberLabels[task.prompt.requestedNumber] ?? task.prompt.requestedNumber;
  const base = formatInstructionTemplate(copy.noun.instruction, {
    lemma: task.lexeme.lemma,
    caseLabel,
    numberLabel,
  });
  return ensureSentence(base);
}

export function buildAdjectiveInstruction(copy: PracticeCardMessages, task: PracticeTask<'adj_ending'>): string {
  const degreeLabel = copy.degreeLabels[task.prompt.degree] ?? task.prompt.degree;
  const base = formatInstructionTemplate(copy.adjective.instruction, {
    lemma: task.lexeme.lemma,
    degreeLabel,
  });
  return ensureSentence(base);
}

export function getTaskInstructions(copy: PracticeCardMessages, task: PracticeTask): string {
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

export function buildPromptSummary(copy: PracticeCardMessages, task: PracticeTask<'conjugate_form'>): string {
  const instructions = getTaskInstructions(copy, task);
  return `${task.lexeme.lemma} – ${instructions}`;
}

export function buildNounPromptSummary(copy: PracticeCardMessages, task: PracticeTask<'noun_case_declension'>): string {
  const caseLabel = copy.caseLabels[task.prompt.requestedCase] ?? task.prompt.requestedCase;
  const numberLabel = copy.numberLabels[task.prompt.requestedNumber] ?? task.prompt.requestedNumber;
  return `${task.lexeme.lemma} – ${caseLabel} ${numberLabel}`;
}

export function buildAdjectivePromptSummary(copy: PracticeCardMessages, task: PracticeTask<'adj_ending'>): string {
  const degreeLabel = copy.degreeLabels[task.prompt.degree] ?? task.prompt.degree;
  return `${task.lexeme.lemma} – ${degreeLabel}`;
}

interface ExampleContent {
  de: string;
  en: string;
}

export function resolveExampleContent(task: PracticeTask): ExampleContent | null {
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

export function renderTranslationText(
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

export function toLegacyVerbPayload(
  task: PracticeTask<'conjugate_form'>,
  submitted: string,
): {
  infinitive: string;
  mode: 'präteritum' | 'partizipII';
  level?: CEFRLevel;
  attemptedAnswer: string;
} {
  const level = task.lexeme.metadata?.level as CEFRLevel | undefined;
  const mode: 'präteritum' | 'partizipII' = task.prompt.requestedForm.tense === 'past' ? 'präteritum' : 'partizipII';
  return {
    infinitive: task.lexeme.lemma,
    mode,
    level,
    attemptedAnswer: submitted,
  };
}

type ToastFunction = ReturnType<typeof useToast>['toast'];

export function createOfflineToast(copy: PracticeCardMessages, toast: ToastFunction) {
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

export function createErrorToast(copy: PracticeCardMessages, toast: ToastFunction, message?: string) {
  toast({
    title: copy.error.title,
    description: message ?? copy.error.generic,
    variant: 'destructive',
  });
}
