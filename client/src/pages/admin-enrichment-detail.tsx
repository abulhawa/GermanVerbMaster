import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, AlertTriangle, MinusCircle, ChevronDown } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

import {
  applyWordEnrichment,
  previewWordEnrichment,
  type ApplyEnrichmentResponse,
  type WordEnrichmentOptions,
} from '@/lib/admin-enrichment';
import type { useToast as UseToastHook } from '@/hooks/use-toast';
import { wordSchema, type AdminWord } from './admin-word-schemas';
import {
  BooleanToggle,
  DetailField,
  formatMissingField,
  getMissingFields,
} from './admin-enrichment-shared';
import type {
  EnrichmentExampleCandidate,
  EnrichmentPatch,
  EnrichmentProviderDiagnostic,
  EnrichmentProviderSnapshot,
  EnrichmentSnapshotTrigger,
  EnrichmentTranslationCandidate,
  EnrichmentVerbFormSuggestion,
  EnrichmentNounFormSuggestion,
  EnrichmentAdjectiveFormSuggestion,
  WordEnrichmentPreview,
} from '@shared/enrichment';

type ToastFn = ReturnType<typeof UseToastHook>['toast'];

interface FieldDrafts {
  english: string;
  exampleDe: string;
  exampleEn: string;
  sourcesCsv: string;
  praeteritum: string;
  partizipIi: string;
  perfekt: string;
  aux: string;
  gender: string;
  plural: string;
  comparative: string;
  superlative: string;
}

export interface WordConfigState extends WordEnrichmentOptions {
  enableAi: boolean;
  allowOverwrite: boolean;
  collectSynonyms: boolean;
  collectExamples: boolean;
  collectTranslations: boolean;
}

interface WordEnrichmentDetailViewProps {
  wordId: number;
  adminToken: string;
  normalizedAdminToken: string;
  onAdminTokenChange: (value: string) => void;
  toast: ToastFn;
  onClose: () => void;
  wordConfig: WordConfigState;
  setWordConfig: React.Dispatch<React.SetStateAction<WordConfigState>>;
  autoPreview?: boolean;
}

const MANUAL_OPTION = 'manual';

const GENDER_OPTION_MAP: Record<string, string> = {
  masculine: 'der',
  feminine: 'die',
  neuter: 'das',
  m: 'der',
  f: 'die',
  n: 'das',
};

function normaliseGenderCandidateValue(value: string | undefined | null): string | null {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed === 'der' || trimmed === 'die' || trimmed === 'das') {
    return trimmed;
  }
  return GENDER_OPTION_MAP[trimmed] ?? null;
}

function extractGenderValues(candidate: EnrichmentNounFormSuggestion): string[] {
  const results = new Set<string>();
  for (const gender of candidate.genders ?? []) {
    const normalised = normaliseGenderCandidateValue(gender);
    if (normalised) {
      results.add(normalised);
    }
  }
  for (const form of candidate.forms ?? []) {
    for (const tag of form.tags ?? []) {
      const normalised = normaliseGenderCandidateValue(tag);
      if (normalised) {
        results.add(normalised);
      }
    }
  }
  return Array.from(results);
}

function extractPluralValues(candidate: EnrichmentNounFormSuggestion): Array<{ value: string; descriptor?: string }> {
  const results = new Map<string, string | undefined>();
  for (const plural of candidate.plurals ?? []) {
    const trimmed = plural.trim();
    if (trimmed && !results.has(trimmed)) {
      results.set(trimmed, undefined);
    }
  }
  for (const form of candidate.forms ?? []) {
    const formValue = form.form?.trim();
    if (!formValue) continue;
    if (!form.tags?.some((tag) => tag.toLowerCase().includes('plural'))) {
      continue;
    }
    const descriptor = form.tags?.join(', ');
    if (!results.has(formValue)) {
      results.set(formValue, descriptor);
    }
  }
  return Array.from(results.entries()).map(([value, descriptor]) => ({ value, descriptor }));
}

export const DEFAULT_WORD_CONFIG: WordConfigState = {
  enableAi: false,
  allowOverwrite: false,
  collectSynonyms: true,
  collectExamples: true,
  collectTranslations: true,
};

function extractAdjectiveValues(
  candidate: EnrichmentAdjectiveFormSuggestion,
  field: 'comparatives' | 'superlatives',
): string[] {
  const values = new Set<string>();
  for (const entry of candidate[field] ?? []) {
    const trimmed = entry.trim();
    if (trimmed) {
      values.add(trimmed);
    }
  }
  for (const form of candidate.forms ?? []) {
    const formValue = form.form?.trim();
    if (!formValue) continue;
    if (form.tags?.some((tag) => tag.toLowerCase().includes(field === 'comparatives' ? 'comparative' : 'superlative'))) {
      values.add(formValue);
    }
  }
  return Array.from(values);
}

const buildGenderOptionId = (candidateIndex: number, valueIndex: number) => `noun-gender-${candidateIndex}-${valueIndex}`;
const buildPluralOptionId = (candidateIndex: number, valueIndex: number) => `noun-plural-${candidateIndex}-${valueIndex}`;
const buildAdjectiveOptionId = (
  type: 'comparative' | 'superlative',
  candidateIndex: number,
  valueIndex: number,
) => `adjective-${type}-${candidateIndex}-${valueIndex}`;

const WordEnrichmentDetailView = ({
  wordId,
  adminToken,
  normalizedAdminToken,
  onAdminTokenChange,
  toast,
  onClose,
  wordConfig,
  setWordConfig,
  autoPreview = false,
}: WordEnrichmentDetailViewProps) => {
  const [drafts, setDrafts] = useState<FieldDrafts>({
    english: '',
    exampleDe: '',
    exampleEn: '',
    sourcesCsv: '',
    praeteritum: '',
    partizipIi: '',
    perfekt: '',
    aux: '',
    gender: '',
    plural: '',
    comparative: '',
    superlative: '',
  });
  const [selectedOptions, setSelectedOptions] = useState<{
    english?: string;
    exampleDe?: string;
    exampleEn?: string;
    praeteritum?: string;
    partizipIi?: string;
    perfekt?: string;
    aux?: string;
    gender?: string;
    plural?: string;
    comparative?: string;
    superlative?: string;
  }>({});
  const [previewData, setPreviewData] = useState<WordEnrichmentPreview | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyEnrichmentResponse | null>(null);

  const wordQuery = useQuery({
    queryKey: ['admin-enrichment', 'word-detail', wordId, normalizedAdminToken],
    queryFn: async () => {
      const headers: Record<string, string> = {};
      if (normalizedAdminToken) {
        headers['x-admin-token'] = normalizedAdminToken;
      }
      const response = await fetch(`/api/words/${wordId}`, { headers });
      if (!response.ok) {
        throw new Error(`Failed to load word (${response.status})`);
      }
      const payload = await response.json();
      return wordSchema.parse(payload);
    },
    enabled: Number.isFinite(wordId) && wordId > 0,
  });

  const word = wordQuery.data;

  useEffect(() => {
    if (word) {
      setDrafts({
        english: word.english ?? '',
        exampleDe: word.exampleDe ?? '',
        exampleEn: word.exampleEn ?? '',
        sourcesCsv: word.sourcesCsv ?? '',
        praeteritum: word.praeteritum ?? '',
        partizipIi: word.partizipIi ?? '',
        perfekt: word.perfekt ?? '',
        aux: word.aux ?? '',
        gender: word.gender ?? '',
        plural: word.plural ?? '',
        comparative: word.comparative ?? '',
        superlative: word.superlative ?? '',
      });
      setPreviewData(null);
      setSelectedOptions({
        english: word.english ? MANUAL_OPTION : undefined,
        exampleDe: word.exampleDe ? MANUAL_OPTION : undefined,
        exampleEn: word.exampleEn ? MANUAL_OPTION : undefined,
        praeteritum: word.praeteritum ? MANUAL_OPTION : undefined,
        partizipIi: word.partizipIi ? MANUAL_OPTION : undefined,
        perfekt: word.perfekt ? MANUAL_OPTION : undefined,
        aux: word.aux ? MANUAL_OPTION : undefined,
        gender: word.gender ? MANUAL_OPTION : undefined,
        plural: word.plural ? MANUAL_OPTION : undefined,
        comparative: word.comparative ? MANUAL_OPTION : undefined,
        superlative: word.superlative ? MANUAL_OPTION : undefined,
      });
      setApplyResult(null);
    }
  }, [word?.id]);

  const translationOptions = useMemo(() => {
    if (!previewData) return [] as Array<{ id: string; candidate: EnrichmentTranslationCandidate }>;
    return previewData.suggestions.translations.map((candidate, index) => ({
      id: `translation-${index}`,
      candidate,
    }));
  }, [previewData]);

  const exampleOptions = useMemo(() => {
    if (!previewData) return [] as Array<{ id: string; candidate: EnrichmentExampleCandidate }>;
    return previewData.suggestions.examples.map((candidate, index) => ({
      id: `example-${index}`,
      candidate,
    }));
  }, [previewData]);

  const exampleDeOptions = useMemo(
    () => exampleOptions.filter((option) => option.candidate.exampleDe),
    [exampleOptions],
  );
  const exampleEnOptions = useMemo(
    () => exampleOptions.filter((option) => option.candidate.exampleEn),
    [exampleOptions],
  );

  const verbFormOptions = useMemo(() => {
    if (!previewData) return [] as Array<{ id: string; candidate: EnrichmentVerbFormSuggestion }>;
    return previewData.suggestions.verbForms.map((candidate, index) => ({
      id: `verb-${index}`,
      candidate,
    }));
  }, [previewData]);

  const praeteritumOptions = useMemo(
    () => verbFormOptions.filter((option) => option.candidate.praeteritum),
    [verbFormOptions],
  );
  const partizipIiOptions = useMemo(
    () => verbFormOptions.filter((option) => option.candidate.partizipIi),
    [verbFormOptions],
  );
  const perfektOptions = useMemo(
    () =>
      verbFormOptions.filter(
        (option) => option.candidate.perfekt || (option.candidate.perfektOptions?.length ?? 0) > 0,
      ),
    [verbFormOptions],
  );
  const auxOptions = useMemo(
    () =>
      verbFormOptions.filter(
        (option) => option.candidate.aux || (option.candidate.auxiliaries?.length ?? 0) > 0,
      ),
    [verbFormOptions],
  );

  const nounGenderOptions = useMemo(() => {
    if (!previewData) {
      return [] as Array<{ id: string; value: string; source: string; suggestion: EnrichmentNounFormSuggestion }>;
    }
    const options: Array<{ id: string; value: string; source: string; suggestion: EnrichmentNounFormSuggestion }> = [];
    previewData.suggestions.nounForms.forEach((candidate, candidateIndex) => {
      const values = extractGenderValues(candidate);
      values.forEach((value, valueIndex) => {
        options.push({
          id: buildGenderOptionId(candidateIndex, valueIndex),
          value,
          source: candidate.source,
          suggestion: candidate,
        });
      });
    });
    return options;
  }, [previewData]);

  const nounPluralOptions = useMemo(() => {
    if (!previewData) {
      return [] as Array<{ id: string; value: string; label?: string; source: string; suggestion: EnrichmentNounFormSuggestion }>;
    }
    const options: Array<{
      id: string;
      value: string;
      label?: string;
      source: string;
      suggestion: EnrichmentNounFormSuggestion;
    }> = [];
    previewData.suggestions.nounForms.forEach((candidate, candidateIndex) => {
      const values = extractPluralValues(candidate);
      values.forEach((entry, valueIndex) => {
        options.push({
          id: buildPluralOptionId(candidateIndex, valueIndex),
          value: entry.value,
          label: entry.descriptor,
          source: candidate.source,
          suggestion: candidate,
        });
      });
    });
    return options;
  }, [previewData]);

  const adjectiveComparativeOptions = useMemo(() => {
    if (!previewData) {
      return [] as Array<{ id: string; value: string; source: string; suggestion: EnrichmentAdjectiveFormSuggestion }>;
    }
    const options: Array<{ id: string; value: string; source: string; suggestion: EnrichmentAdjectiveFormSuggestion }> = [];
    previewData.suggestions.adjectiveForms.forEach((candidate, candidateIndex) => {
      const values = extractAdjectiveValues(candidate, 'comparatives');
      values.forEach((value, valueIndex) => {
        options.push({
          id: buildAdjectiveOptionId('comparative', candidateIndex, valueIndex),
          value,
          source: candidate.source,
          suggestion: candidate,
        });
      });
    });
    return options;
  }, [previewData]);

  const adjectiveSuperlativeOptions = useMemo(() => {
    if (!previewData) {
      return [] as Array<{ id: string; value: string; source: string; suggestion: EnrichmentAdjectiveFormSuggestion }>;
    }
    const options: Array<{ id: string; value: string; source: string; suggestion: EnrichmentAdjectiveFormSuggestion }> = [];
    previewData.suggestions.adjectiveForms.forEach((candidate, candidateIndex) => {
      const values = extractAdjectiveValues(candidate, 'superlatives');
      values.forEach((value, valueIndex) => {
        options.push({
          id: buildAdjectiveOptionId('superlative', candidateIndex, valueIndex),
          value,
          source: candidate.source,
          suggestion: candidate,
        });
      });
    });
    return options;
  }, [previewData]);

  const mergedWord = useMemo(() => (word ? mergeWordWithDrafts(word, drafts) : null), [word, drafts]);
  const missingBefore = useMemo(() => (word ? getMissingFields(word) : []), [word]);
  const missingAfter = useMemo(() => (mergedWord ? getMissingFields(mergedWord) : []), [mergedWord]);
  const nextComplete = useMemo(() => (word ? computeCompletenessWithDraft(word, drafts) : false), [word, drafts]);

  const hasPendingChanges = useMemo(() => {
    if (!word) return false;
    const patch = buildPatchFromDrafts(word, drafts, previewData);
    return hasPatchChanges(patch);
  }, [word, drafts, previewData]);

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!word) {
        throw new Error('Word is not loaded yet');
      }
      const options: WordEnrichmentOptions = {
        enableAi: wordConfig.enableAi,
        allowOverwrite: wordConfig.allowOverwrite,
        collectSynonyms: wordConfig.collectSynonyms,
        collectExamples: wordConfig.collectExamples,
        collectTranslations: wordConfig.collectTranslations,
      };
      const result = await previewWordEnrichment(word.id, options, normalizedAdminToken);
      return result;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setApplyResult(null);
      setSelectedOptions((current) => ({
        english:
          findMatchingTranslationOptionId(data.patch.english, data.suggestions.translations) ??
          current.english ??
          (data.patch.english !== undefined || (word?.english ?? '').length
            ? MANUAL_OPTION
            : undefined),
        exampleDe:
          findMatchingExampleOptionId(data.patch.exampleDe, data.suggestions.examples, 'exampleDe') ??
          current.exampleDe ??
          (data.patch.exampleDe !== undefined || (word?.exampleDe ?? '').length
            ? MANUAL_OPTION
            : undefined),
        exampleEn:
          findMatchingExampleOptionId(data.patch.exampleEn, data.suggestions.examples, 'exampleEn') ??
          current.exampleEn ??
          (data.patch.exampleEn !== undefined || (word?.exampleEn ?? '').length
            ? MANUAL_OPTION
            : undefined),
        praeteritum:
          findMatchingVerbFormOptionId(data.patch.praeteritum, data.suggestions.verbForms, 'praeteritum') ??
          current.praeteritum ??
          (data.patch.praeteritum !== undefined || (word?.praeteritum ?? '').length
            ? MANUAL_OPTION
            : undefined),
        partizipIi:
          findMatchingVerbFormOptionId(data.patch.partizipIi, data.suggestions.verbForms, 'partizipIi') ??
          current.partizipIi ??
          (data.patch.partizipIi !== undefined || (word?.partizipIi ?? '').length
            ? MANUAL_OPTION
            : undefined),
        perfekt:
          findMatchingVerbFormOptionId(data.patch.perfekt, data.suggestions.verbForms, 'perfekt') ??
          current.perfekt ??
          (data.patch.perfekt !== undefined || (word?.perfekt ?? '').length
            ? MANUAL_OPTION
            : undefined),
        aux:
          findMatchingVerbFormOptionId(data.patch.aux, data.suggestions.verbForms, 'aux') ??
          current.aux ??
          (data.patch.aux !== undefined || (word?.aux ?? '').length ? MANUAL_OPTION : undefined),
        gender:
          word?.pos === 'N'
            ? findMatchingGenderOptionId(data.patch.gender, data.suggestions.nounForms) ??
              current.gender ??
              (data.patch.gender !== undefined || (word?.gender ?? '').length
                ? MANUAL_OPTION
                : undefined)
            : undefined,
        plural:
          word?.pos === 'N'
            ? findMatchingPluralOptionId(data.patch.plural, data.suggestions.nounForms) ??
              current.plural ??
              (data.patch.plural !== undefined || (word?.plural ?? '').length
                ? MANUAL_OPTION
                : undefined)
            : undefined,
        comparative:
          word?.pos === 'Adj'
            ? findMatchingAdjectiveOptionId(
                data.patch.comparative,
                data.suggestions.adjectiveForms,
                'comparative',
              )
                ?? current.comparative
                ?? (data.patch.comparative !== undefined || (word?.comparative ?? '').length
                  ? MANUAL_OPTION
                  : undefined)
            : undefined,
        superlative:
          word?.pos === 'Adj'
            ? findMatchingAdjectiveOptionId(
                data.patch.superlative,
                data.suggestions.adjectiveForms,
                'superlative',
              )
                ?? current.superlative
                ?? (data.patch.superlative !== undefined || (word?.superlative ?? '').length
                  ? MANUAL_OPTION
                  : undefined)
            : undefined,
      }));
      setDrafts((previous) => ({
        english: data.patch.english !== undefined ? data.patch.english ?? '' : previous.english,
        exampleDe: data.patch.exampleDe !== undefined ? data.patch.exampleDe ?? '' : previous.exampleDe,
        exampleEn: data.patch.exampleEn !== undefined ? data.patch.exampleEn ?? '' : previous.exampleEn,
        sourcesCsv: data.patch.sourcesCsv !== undefined ? data.patch.sourcesCsv ?? '' : previous.sourcesCsv,
        praeteritum: data.patch.praeteritum !== undefined ? data.patch.praeteritum ?? '' : previous.praeteritum,
        partizipIi: data.patch.partizipIi !== undefined ? data.patch.partizipIi ?? '' : previous.partizipIi,
        perfekt: data.patch.perfekt !== undefined ? data.patch.perfekt ?? '' : previous.perfekt,
        aux:
          data.patch.aux !== undefined
            ? data.patch.aux ?? ''
            : previous.aux,
        gender: data.patch.gender !== undefined ? data.patch.gender ?? '' : previous.gender,
        plural: data.patch.plural !== undefined ? data.patch.plural ?? '' : previous.plural,
        comparative:
          data.patch.comparative !== undefined ? data.patch.comparative ?? '' : previous.comparative,
        superlative:
          data.patch.superlative !== undefined ? data.patch.superlative ?? '' : previous.superlative,
      }));
      toast({
        title: 'Preview ready',
        description: 'Review the fetched suggestions below.',
      });
    },
    onError: (error) => {
      setPreviewData(null);
      setSelectedOptions({});
      toast({
        title: 'Failed to preview enrichment',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (!autoPreview) return;
    if (!word) return;
    if (previewMutation.isPending) return;
    if (previewData) return;
    previewMutation.mutate();
  }, [autoPreview, word?.id, previewMutation.isPending, previewMutation.mutate, previewData]);

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!word) {
        throw new Error('Word is not loaded yet');
      }
      const patch = buildPatchFromDrafts(word, drafts, previewData);
      if (!hasPatchChanges(patch)) {
        throw new Error('No changes to apply');
      }
      const result = await applyWordEnrichment(word.id, patch, normalizedAdminToken);
      return result;
    },
    onSuccess: (result) => {
      setApplyResult(result);
      toast({
        title: 'Enrichment applied',
        description: result.appliedFields.length
          ? `Updated ${result.appliedFields.join(', ')}`
          : 'No fields changed',
      });
      wordQuery.refetch();
    },
    onError: (error) => {
      toast({
        title: 'Failed to apply changes',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const handleTranslationSelect = (optionId: string) => {
    if (optionId === MANUAL_OPTION) {
      setSelectedOptions((current) => ({ ...current, english: MANUAL_OPTION }));
      setApplyResult(null);
      return;
    }
    const option = translationOptions.find((entry) => entry.id === optionId);
    if (!option) {
      setSelectedOptions((current) => ({ ...current, english: undefined }));
      return;
    }
    setDrafts((previous) => ({ ...previous, english: option.candidate.value }));
    setSelectedOptions((current) => ({ ...current, english: optionId }));
    setApplyResult(null);
  };

  const handleExampleSelect = (optionId: string, field: 'exampleDe' | 'exampleEn') => {
    if (optionId === MANUAL_OPTION) {
      setSelectedOptions((current) => ({ ...current, [field]: MANUAL_OPTION }));
      setApplyResult(null);
      return;
    }
    const sourceOptions = field === 'exampleDe' ? exampleDeOptions : exampleEnOptions;
    const option = sourceOptions.find((entry) => entry.id === optionId);
    if (!option) {
      setSelectedOptions((current) => ({ ...current, [field]: undefined }));
      return;
    }
    const value = field === 'exampleDe' ? option.candidate.exampleDe ?? '' : option.candidate.exampleEn ?? '';
    setDrafts((previous) => ({ ...previous, [field]: value }));
    setSelectedOptions((current) => ({ ...current, [field]: optionId }));
    setApplyResult(null);
  };

  const handleVerbFormSelect = (
    field: 'praeteritum' | 'partizipIi' | 'perfekt' | 'aux',
    optionId: string,
  ) => {
    if (optionId === MANUAL_OPTION) {
      setSelectedOptions((current) => ({ ...current, [field]: MANUAL_OPTION }));
      setApplyResult(null);
      return;
    }

    const sourceMap: Record<typeof field, Array<{ id: string; candidate: EnrichmentVerbFormSuggestion }>> = {
      praeteritum: praeteritumOptions,
      partizipIi: partizipIiOptions,
      perfekt: perfektOptions,
      aux: auxOptions,
    };

    const option = sourceMap[field].find((entry) => entry.id === optionId);
    if (!option) {
      setSelectedOptions((current) => ({ ...current, [field]: undefined }));
      return;
    }

    const candidateValue = option.candidate[field];
    let value = typeof candidateValue === 'string' ? candidateValue : '';
    if (field === 'aux' && !value) {
      const auxiliaries = option.candidate.auxiliaries ?? [];
      if (auxiliaries.length === 1) {
        value = auxiliaries[0];
      } else if (auxiliaries.length > 1) {
        value = auxiliaries.join(' / ');
      }
    }
    if (field === 'perfekt' && !value) {
      const options = option.candidate.perfektOptions ?? [];
      value = options[0] ?? '';
    }
    setDrafts((previous) => ({ ...previous, [field]: value }));
    setSelectedOptions((current) => ({ ...current, [field]: optionId }));
    setApplyResult(null);
  };

  const handleVerbFieldInput = (
    field: 'praeteritum' | 'partizipIi' | 'perfekt',
    value: string,
  ) => {
    setDrafts((previous) => ({ ...previous, [field]: value }));
    setSelectedOptions((current) => ({ ...current, [field]: MANUAL_OPTION }));
    setApplyResult(null);
  };

  const handleAuxManualChange = (value: string) => {
    const lower = value.toLowerCase();
    const normalized =
      lower === 'haben'
        ? 'haben'
        : lower === 'sein'
          ? 'sein'
          : lower.replace(/\s+/g, '') === 'haben/sein'
            ? 'haben / sein'
            : '';
    setDrafts((previous) => ({ ...previous, aux: normalized }));
    setSelectedOptions((current) => ({ ...current, aux: MANUAL_OPTION }));
    setApplyResult(null);
  };

  const handleNounSelect = (field: 'gender' | 'plural', optionId: string) => {
    if (optionId === MANUAL_OPTION) {
      setSelectedOptions((current) => ({ ...current, [field]: MANUAL_OPTION }));
      setApplyResult(null);
      return;
    }
    const options = field === 'gender' ? nounGenderOptions : nounPluralOptions;
    const option = options.find((entry) => entry.id === optionId);
    if (!option) {
      return;
    }
    setDrafts((previous) => ({ ...previous, [field]: option.value }));
    setSelectedOptions((current) => ({ ...current, [field]: optionId }));
    setApplyResult(null);
  };

  const handleAdjectiveSelect = (
    field: 'comparative' | 'superlative',
    optionId: string,
  ) => {
    if (optionId === MANUAL_OPTION) {
      setSelectedOptions((current) => ({ ...current, [field]: MANUAL_OPTION }));
      setApplyResult(null);
      return;
    }
    const options =
      field === 'comparative' ? adjectiveComparativeOptions : adjectiveSuperlativeOptions;
    const option = options.find((entry) => entry.id === optionId);
    if (!option) {
      return;
    }
    setDrafts((previous) => ({ ...previous, [field]: option.value }));
    setSelectedOptions((current) => ({ ...current, [field]: optionId }));
    setApplyResult(null);
  };

  const providerDiagnostics = previewData?.suggestions.providerDiagnostics ?? [];

  const handleDraftChange = (
    field: keyof FieldDrafts,
    value: string,
    optionsField?: 'english' | 'exampleDe' | 'exampleEn' | 'gender' | 'plural' | 'comparative' | 'superlative',
  ) => {
    setDrafts((previous) => ({ ...previous, [field]: value }));
    setApplyResult(null);
    if (optionsField) {
      setSelectedOptions((current) => ({ ...current, [optionsField]: MANUAL_OPTION }));
    }
  };

  const translationSelectValue =
    selectedOptions.english ?? (drafts.english.trim().length ? MANUAL_OPTION : undefined);
  const exampleDeSelectValue =
    selectedOptions.exampleDe ?? (drafts.exampleDe.trim().length ? MANUAL_OPTION : undefined);
  const exampleEnSelectValue =
    selectedOptions.exampleEn ?? (drafts.exampleEn.trim().length ? MANUAL_OPTION : undefined);
  const praeteritumSelectValue =
    selectedOptions.praeteritum ?? (drafts.praeteritum.trim().length ? MANUAL_OPTION : undefined);
  const partizipIiSelectValue =
    selectedOptions.partizipIi ?? (drafts.partizipIi.trim().length ? MANUAL_OPTION : undefined);
  const perfektSelectValue =
    selectedOptions.perfekt ?? (drafts.perfekt.trim().length ? MANUAL_OPTION : undefined);
  const auxSelectValue =
    selectedOptions.aux ?? (drafts.aux.trim().length ? MANUAL_OPTION : undefined);
  const auxManualValue =
    drafts.aux === 'sein'
      ? 'sein'
      : drafts.aux === 'haben'
        ? 'haben'
        : drafts.aux === 'haben / sein'
          ? 'haben / sein'
          : 'none';
  const genderSelectValue =
    selectedOptions.gender ?? (drafts.gender.trim().length ? MANUAL_OPTION : undefined);
  const pluralSelectValue =
    selectedOptions.plural ?? (drafts.plural.trim().length ? MANUAL_OPTION : undefined);
  const comparativeSelectValue =
    selectedOptions.comparative ?? (drafts.comparative.trim().length ? MANUAL_OPTION : undefined);
  const superlativeSelectValue =
    selectedOptions.superlative ?? (drafts.superlative.trim().length ? MANUAL_OPTION : undefined);

  const renderStatusBadge = (label: string, tone: 'default' | 'success' | 'warning' | 'destructive') => {
    const toneClassMap: Record<typeof tone, string> = {
      default: 'bg-muted text-muted-foreground',
      success: 'bg-success/15 text-success-foreground',
      warning: 'bg-warning/15 text-warning-foreground',
      destructive: 'bg-destructive/10 text-destructive',
    };
    return <Badge className={cn('px-2 py-0.5', toneClassMap[tone])}>{label}</Badge>;
  };

  const renderDiagnosticIcon = (status: EnrichmentProviderDiagnostic['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />;
      default:
        return <MinusCircle className="h-4 w-4 text-muted-foreground" aria-hidden />;
    }
  };

  if (wordQuery.isLoading) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 py-6">
        <Button variant="ghost" className="w-fit" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Back to enrichment
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Loading word…</CardTitle>
            <CardDescription>Fetching word details and current enrichment data.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (wordQuery.isError) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6 py-6">
        <Button variant="ghost" className="w-fit" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Back to enrichment
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Unable to load word</CardTitle>
            <CardDescription>
              {wordQuery.error instanceof Error ? wordQuery.error.message : 'An unknown error occurred.'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!word) {
    return null;
  }

  const canonicalBadge = word.canonical
    ? renderStatusBadge('Canonical', 'success')
    : renderStatusBadge('Non-canonical', 'warning');
  const completenessBadge = nextComplete
    ? renderStatusBadge('Complete', 'success')
    : renderStatusBadge('Incomplete', 'warning');

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Button variant="ghost" className="w-fit" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden /> Back to enrichment
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => previewMutation.mutate()}
            disabled={previewMutation.isPending}
          >
            {previewMutation.isPending ? 'Running preview…' : 'Preview enrichment'}
          </Button>
          <Button
            type="button"
            onClick={() => applyMutation.mutate()}
            disabled={applyMutation.isPending || !hasPendingChanges}
          >
            {applyMutation.isPending ? 'Applying…' : 'Apply changes'}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
            {word.lemma}
            <span className="text-base font-normal text-muted-foreground">({word.pos})</span>
          </CardTitle>
          <CardDescription>
            Word #{word.id} · Level {word.level ?? '—'} · Created {formatDisplayDate(word.createdAt)} · Updated{' '}
            {formatDisplayDate(word.updatedAt)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {canonicalBadge}
            {renderStatusBadge(word.complete ? 'Stored as complete' : 'Stored as incomplete', 'default')}
            {completenessBadge}
          </div>
          <Separator />
          <div className="grid gap-4 md:grid-cols-2">
            <DetailField label="English" value={word.english} />
            <DetailField label="German example" value={word.exampleDe} />
            <DetailField label="English example" value={word.exampleEn} />
            <DetailField label="Sources" value={word.sourcesCsv} />
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Missing fields</div>
            <div className="flex flex-wrap gap-1">
              {missingBefore.length ? (
                missingBefore.map((field) => (
                  <Badge key={field} variant="secondary">
                    {formatMissingField(field)}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">No missing fields recorded.</span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              After your edits: {missingAfter.length ? missingAfter.map(formatMissingField).join(', ') : 'all required fields present.'}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Enrichment configuration</CardTitle>
          <CardDescription>Control which sources run when generating suggestions for this word.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label htmlFor="detail-admin-token" className="text-sm text-muted-foreground">
              Admin token
            </Label>
            <Input
              id="detail-admin-token"
              value={adminToken}
              placeholder="Optional API token"
              className="w-full sm:w-72"
              onChange={(event) => onAdminTokenChange(event.target.value)}
            />
          </div>
          <Separator />
          <div className="grid gap-3 md:grid-cols-2">
            <BooleanToggle
              label="Allow overwrite"
              description="Replace existing data when higher-confidence suggestions are available"
              checked={wordConfig.allowOverwrite}
              onCheckedChange={(checked) => {
                setWordConfig((current) => ({ ...current, allowOverwrite: checked }));
                setApplyResult(null);
              }}
            />
            <BooleanToggle
              label="Use AI assistance"
              description="Requires the OPENAI_API_KEY environment variable"
              checked={wordConfig.enableAi}
              onCheckedChange={(checked) => {
                setWordConfig((current) => ({ ...current, enableAi: checked }));
                setApplyResult(null);
              }}
            />
            <BooleanToggle
              label="Collect synonyms"
              checked={wordConfig.collectSynonyms}
              onCheckedChange={(checked) => {
                setWordConfig((current) => ({ ...current, collectSynonyms: checked }));
                setApplyResult(null);
              }}
            />
            <BooleanToggle
              label="Collect example sentences"
              checked={wordConfig.collectExamples}
              onCheckedChange={(checked) => {
                setWordConfig((current) => ({ ...current, collectExamples: checked }));
                setApplyResult(null);
              }}
            />
            <BooleanToggle
              label="Collect translations"
              checked={wordConfig.collectTranslations}
              onCheckedChange={(checked) => {
                setWordConfig((current) => ({ ...current, collectTranslations: checked }));
                setApplyResult(null);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {previewData ? (
        <Card>
          <CardHeader>
            <CardTitle>Suggested updates</CardTitle>
            <CardDescription>
              Review fetched data from the selected providers and decide what to keep or edit manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2 text-sm">
              <div className="font-medium">Sources consulted</div>
              <div className="flex flex-wrap gap-2">
                {previewData.summary.sources.map((source) => (
                  <Badge key={source} variant="secondary">
                    {source}
                  </Badge>
                ))}
              </div>
              {previewData.suggestions.synonyms.length ? (
                <div>
                  <span className="font-medium">Synonyms:</span>{' '}
                  <span className="text-muted-foreground">{previewData.suggestions.synonyms.join(', ')}</span>
                </div>
              ) : null}
              {previewData.suggestions.englishHints.length ? (
                <div>
                  <span className="font-medium">English hints:</span>{' '}
                  <span className="text-muted-foreground">{previewData.suggestions.englishHints.join(', ')}</span>
                </div>
              ) : null}
              {previewData.summary.translations?.length ? (
                <div>
                  <span className="font-medium">Collected translations:</span>
                  <ul className="mt-1 list-disc list-inside space-y-1 text-muted-foreground">
                    {previewData.summary.translations.map((entry, index) => (
                      <li key={`${entry.value}-${entry.source ?? index}`}>
                        <span>{entry.value}</span>
                        {entry.language ? <span>{` (${entry.language})`}</span> : null}
                        {entry.source ? <span>{` · ${entry.source}`}</span> : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {previewData.summary.examples?.length ? (
                <div className="space-y-1">
                  <span className="font-medium">Collected examples:</span>
                  <ul className="mt-1 space-y-2 text-muted-foreground">
                    {previewData.summary.examples.map((entry, index) => (
                      <li key={`${entry.exampleDe ?? ''}-${entry.exampleEn ?? ''}-${index}`} className="space-y-0.5">
                        <div>{entry.exampleDe ?? '—'}</div>
                        {entry.exampleEn ? <div className="text-xs text-muted-foreground">EN: {entry.exampleEn}</div> : null}
                        {entry.source ? (
                          <div className="text-xs text-muted-foreground">Source: {entry.source}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {previewData.summary.nounForms ? (
                <div className="space-y-1">
                  <span className="font-medium">Noun forms:</span>
                  <div className="text-muted-foreground">
                    {previewData.summary.nounForms.genders?.length ? (
                      <div>Genders: {previewData.summary.nounForms.genders.join(', ')}</div>
                    ) : null}
                    {previewData.summary.nounForms.plurals?.length ? (
                      <div>Plurals: {previewData.summary.nounForms.plurals.join(', ')}</div>
                    ) : null}
                    {previewData.summary.nounForms.forms?.length ? (
                      <ul className="mt-1 list-disc list-inside space-y-1">
                        {previewData.summary.nounForms.forms.map((form, index) => (
                          <li key={`${form.form}-${index}`}>
                            {form.form}
                            {form.tags?.length ? <span className="text-xs"> ({form.tags.join(', ')})</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {(() => {
                const prepositionData =
                  previewData.summary.posAttributes?.preposition
                  ?? previewData.summary.prepositionAttributes;
                if (!prepositionData) {
                  return null;
                }
                return (
                  <div className="space-y-1">
                    <span className="font-medium">Preposition details:</span>
                    <div className="text-muted-foreground">
                      {prepositionData.cases?.length ? (
                        <div>Cases: {prepositionData.cases.join(', ')}</div>
                      ) : null}
                      {prepositionData.notes?.length ? (
                        <div className="text-sm">Notes: {prepositionData.notes.join(', ')}</div>
                      ) : null}
                    </div>
                  </div>
                );
              })()}
              {previewData.summary.adjectiveForms ? (
                <div className="space-y-1">
                  <span className="font-medium">Adjective forms:</span>
                  <div className="text-muted-foreground">
                    {previewData.summary.adjectiveForms.comparatives?.length ? (
                      <div>
                        Comparatives: {previewData.summary.adjectiveForms.comparatives.join(', ')}
                      </div>
                    ) : null}
                    {previewData.summary.adjectiveForms.superlatives?.length ? (
                      <div>
                        Superlatives: {previewData.summary.adjectiveForms.superlatives.join(', ')}
                      </div>
                    ) : null}
                    {previewData.summary.adjectiveForms.forms?.length ? (
                      <ul className="mt-1 list-disc list-inside space-y-1">
                        {previewData.summary.adjectiveForms.forms.map((form, index) => (
                          <li key={`${form.form}-${index}`}>
                            {form.form}
                            {form.tags?.length ? <span className="text-xs"> ({form.tags.join(', ')})</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
            <Separator />
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="translation-select">English translation</Label>
                <Select value={translationSelectValue} onValueChange={handleTranslationSelect}>
                  <SelectTrigger id="translation-select">
                    <SelectValue placeholder="Choose a suggested translation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                    {translationOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.candidate.value} · {option.candidate.source}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={drafts.english}
                  placeholder="Enter English translation"
                  onChange={(event) => handleDraftChange('english', event.target.value, 'english')}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="example-de-select">German example</Label>
                  <Select value={exampleDeSelectValue} onValueChange={(value) => handleExampleSelect(value, 'exampleDe')}>
                    <SelectTrigger id="example-de-select">
                      <SelectValue placeholder="Choose a German example" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                      {exampleDeOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.candidate.exampleDe} · {option.candidate.source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={drafts.exampleDe}
                    placeholder="Enter German example"
                    onChange={(event) => handleDraftChange('exampleDe', event.target.value, 'exampleDe')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="example-en-select">English example</Label>
                  <Select value={exampleEnSelectValue} onValueChange={(value) => handleExampleSelect(value, 'exampleEn')}>
                    <SelectTrigger id="example-en-select">
                      <SelectValue placeholder="Choose an English example" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                      {exampleEnOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.candidate.exampleEn ?? option.candidate.exampleDe ?? 'Example'} · {option.candidate.source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea
                    value={drafts.exampleEn}
                    placeholder="Enter English example"
                    onChange={(event) => handleDraftChange('exampleEn', event.target.value, 'exampleEn')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sources-input">Sources</Label>
                <Textarea
                  id="sources-input"
                  value={drafts.sourcesCsv}
                  placeholder="Comma-separated list of sources"
                  onChange={(event) => handleDraftChange('sourcesCsv', event.target.value)}
                />
              </div>

              {word.pos === 'N' ? (
                <div className="space-y-4">
                  <Separator />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="gender-select">Gender</Label>
                      <Select
                        value={genderSelectValue}
                        onValueChange={(value) => handleNounSelect('gender', value)}
                      >
                        <SelectTrigger id="gender-select">
                          <SelectValue placeholder="Choose a gender" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {nounGenderOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.value} · {option.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={drafts.gender}
                        placeholder="Enter gender (der/die/das)"
                        onChange={(event) => handleDraftChange('gender', event.target.value, 'gender')}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="plural-select">Plural form</Label>
                      <Select
                        value={pluralSelectValue}
                        onValueChange={(value) => handleNounSelect('plural', value)}
                      >
                        <SelectTrigger id="plural-select">
                          <SelectValue placeholder="Choose a plural form" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {nounPluralOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.value}
                              {option.label ? ` · ${option.label}` : ''} · {option.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={drafts.plural}
                        placeholder="Enter plural form"
                        onChange={(event) => handleDraftChange('plural', event.target.value, 'plural')}
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {word.pos === 'Adj' ? (
                <div className="space-y-4">
                  <Separator />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="comparative-select">Comparative</Label>
                      <Select
                        value={comparativeSelectValue}
                        onValueChange={(value) => handleAdjectiveSelect('comparative', value)}
                      >
                        <SelectTrigger id="comparative-select">
                          <SelectValue placeholder="Choose a comparative" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {adjectiveComparativeOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.value} · {option.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={drafts.comparative}
                        placeholder="Enter comparative"
                        onChange={(event) =>
                          handleDraftChange('comparative', event.target.value, 'comparative')
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="superlative-select">Superlative</Label>
                      <Select
                        value={superlativeSelectValue}
                        onValueChange={(value) => handleAdjectiveSelect('superlative', value)}
                      >
                        <SelectTrigger id="superlative-select">
                          <SelectValue placeholder="Choose a superlative" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {adjectiveSuperlativeOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.value} · {option.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={drafts.superlative}
                        placeholder="Enter superlative"
                        onChange={(event) =>
                          handleDraftChange('superlative', event.target.value, 'superlative')
                        }
                      />
                    </div>
                  </div>
                </div>
              ) : null}

              {word.pos === 'V' ? (
                <div className="space-y-4">
                  <Separator />
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="praeteritum-select">Präteritum</Label>
                      <Select
                        value={praeteritumSelectValue}
                        onValueChange={(value) => handleVerbFormSelect('praeteritum', value)}
                      >
                        <SelectTrigger id="praeteritum-select">
                          <SelectValue placeholder="Choose a Präteritum form" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {praeteritumOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.candidate.praeteritum} · {option.candidate.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={drafts.praeteritum}
                        placeholder="Enter präteritum"
                        onChange={(event) => handleVerbFieldInput('praeteritum', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="partizip-select">Partizip II</Label>
                      <Select
                        value={partizipIiSelectValue}
                        onValueChange={(value) => handleVerbFormSelect('partizipIi', value)}
                      >
                        <SelectTrigger id="partizip-select">
                          <SelectValue placeholder="Choose a Partizip II" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {partizipIiOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {option.candidate.partizipIi} · {option.candidate.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={drafts.partizipIi}
                        placeholder="Enter Partizip II"
                        onChange={(event) => handleVerbFieldInput('partizipIi', event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="perfekt-select">Perfekt</Label>
                      <Select
                        value={perfektSelectValue}
                        onValueChange={(value) => handleVerbFormSelect('perfekt', value)}
                      >
                        <SelectTrigger id="perfekt-select">
                          <SelectValue placeholder="Choose a Perfekt form" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {perfektOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {(
                                option.candidate.perfektOptions?.length
                                  ? option.candidate.perfektOptions.join(' / ')
                                  : option.candidate.perfekt
                              ) ?? '—'}{' '}
                              · {option.candidate.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={drafts.perfekt}
                        placeholder="Enter Perfekt"
                        onChange={(event) => handleVerbFieldInput('perfekt', event.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="aux-select">Auxiliary verb</Label>
                      <Select value={auxSelectValue} onValueChange={(value) => handleVerbFormSelect('aux', value)}>
                        <SelectTrigger id="aux-select">
                          <SelectValue placeholder="Choose auxiliary source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={MANUAL_OPTION}>Manual entry</SelectItem>
                          {auxOptions.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {(
                                option.candidate.auxiliaries?.length
                                  ? option.candidate.auxiliaries.join(' / ')
                                  : option.candidate.aux ?? '—'
                              )}{' '}
                              · {option.candidate.source}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={auxManualValue}
                        onValueChange={handleAuxManualChange}
                        disabled={auxSelectValue !== MANUAL_OPTION}
                      >
                        <SelectTrigger id="aux-manual-select">
                          <SelectValue placeholder="Select auxiliary verb" />
                        </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not set</SelectItem>
                        <SelectItem value="haben">haben</SelectItem>
                        <SelectItem value="sein">sein</SelectItem>
                        <SelectItem value="haben / sein">haben / sein</SelectItem>
                      </SelectContent>
                    </Select>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No preview yet</CardTitle>
            <CardDescription>
              Run a preview to fetch the latest translations, examples, and diagnostics before applying changes.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {applyResult ? (
        <Card>
          <CardHeader>
            <CardTitle>Latest apply result</CardTitle>
            <CardDescription>
              {applyResult.appliedFields.length
                ? `Updated ${applyResult.appliedFields.join(', ')}`
                : 'No changes were applied.'}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Provider diagnostics</CardTitle>
          <CardDescription>
            Inspect the API responses from each provider to validate the suggestions before applying them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {providerDiagnostics.length ? (
            providerDiagnostics.map((diagnostic) => (
              <Collapsible key={diagnostic.id} className="rounded-lg border border-border">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                  >
                    <div className="flex items-center gap-2">
                      {renderDiagnosticIcon(diagnostic.status)}
                      <span className="font-medium">{diagnostic.label}</span>
                      <Badge variant="secondary">{diagnostic.status}</Badge>
                    </div>
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 border-t border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
                  {diagnostic.currentSnapshot || diagnostic.previousSnapshot ? (
                    <div className="space-y-3 text-foreground">
                      {diagnostic.currentSnapshot ? (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Latest snapshot · {formatDisplayDate(diagnostic.currentSnapshot.collectedAt)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatSnapshotTriggerLabel(diagnostic.currentSnapshot.trigger)} ·{' '}
                            {formatSnapshotModeLabel(diagnostic.currentSnapshot.mode)}
                          </div>
                          <SnapshotDataList snapshot={diagnostic.currentSnapshot} />
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No snapshot captured for this provider yet.</p>
                      )}
                      {diagnostic.previousSnapshot ? (
                        diagnostic.hasChanges ? (
                          <div className="space-y-2">
                            <Separator />
                            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Previous snapshot · {formatDisplayDate(diagnostic.previousSnapshot.collectedAt)}
                            </div>
                            <SnapshotDataList snapshot={diagnostic.previousSnapshot} />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            No changes since {formatDisplayDate(diagnostic.previousSnapshot.collectedAt)}.
                          </p>
                        )
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No snapshot captured for this provider yet.</p>
                  )}
                  {diagnostic.error ? (
                    <div className="text-destructive">Error: {diagnostic.error}</div>
                  ) : null}
                  {diagnostic.payload ? (
                    <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 text-xs text-foreground">
                      {JSON.stringify(diagnostic.payload, null, 2)}
                    </pre>
                  ) : (
                    <div>No additional payload captured.</div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Provider diagnostics will appear after running an enrichment preview.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default WordEnrichmentDetailView;

function SnapshotDataList({ snapshot }: { snapshot: EnrichmentProviderSnapshot }) {
  const translations = snapshot.translations ?? [];
  const examples = snapshot.examples ?? [];
  const synonyms = snapshot.synonyms ?? [];
  const englishHints = snapshot.englishHints ?? [];
  const verbForms = snapshot.verbForms ?? [];
  const hasData =
    translations.length || examples.length || synonyms.length || englishHints.length || verbForms.length;

  if (!hasData) {
    return <p className="text-xs text-muted-foreground">No structured data captured for this run.</p>;
  }

  return (
    <div className="space-y-3 text-sm text-foreground">
      {translations.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Translations</div>
          <ul className="list-disc space-y-1 pl-4">
            {translations.map((translation, index) => (
              <li key={`${translation.value}-${translation.source ?? 'unknown'}-${index}`}>
                <span className="font-medium">{translation.value}</span>
                {translation.language ? <span className="text-muted-foreground"> ({translation.language})</span> : null}
                {translation.source ? <span className="text-muted-foreground"> · {translation.source}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {examples.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Examples</div>
          <ul className="space-y-1">
            {examples.map((example, index) => (
              <li key={`${example.exampleDe ?? '—'}-${example.exampleEn ?? '—'}-${index}`} className="leading-snug">
                <span className="font-medium text-foreground">{example.exampleDe ?? '—'}</span>
                {example.exampleEn ? <span className="text-muted-foreground"> · {example.exampleEn}</span> : null}
                {example.source ? <span className="text-muted-foreground"> · {example.source}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {synonyms.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Synonyms</div>
          <p className="text-sm text-foreground">{synonyms.join(', ')}</p>
        </div>
      ) : null}

      {englishHints.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">English hints</div>
          <p className="text-sm text-foreground">{englishHints.join(', ')}</p>
        </div>
      ) : null}

      {verbForms.length ? (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verb forms</div>
          <ul className="space-y-1">
            {verbForms.map((form, index) => (
              <li key={`${form.source}-${index}`} className="leading-snug">
                {form.praeteritum ? <span>Präteritum: {form.praeteritum} </span> : null}
                {form.partizipIi ? <span>· Partizip II: {form.partizipIi} </span> : null}
                {form.perfekt ? <span>· Perfekt: {form.perfekt} </span> : null}
                {form.perfektOptions?.length ? <span>· Perfekt options: {form.perfektOptions.join(' / ')} </span> : null}
                {form.auxiliaries?.length ? <span>· Aux: {form.auxiliaries.join(' / ')} </span> : null}
                {form.aux && !form.auxiliaries?.length ? <span>· Aux: {form.aux}</span> : null}
                <span className="text-muted-foreground"> · {form.source}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function formatSnapshotTriggerLabel(trigger: EnrichmentSnapshotTrigger): string {
  switch (trigger) {
    case 'apply':
      return 'Applied run';
    default:
      return 'Preview run';
  }
}

function formatSnapshotModeLabel(mode: string): string {
  switch (mode) {
    case 'canonical':
      return 'Canonical mode';
    case 'all':
      return 'Full dataset';
    default:
      return 'Non-canonical mode';
  }
}

export function formatDisplayDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function mergeWordWithDrafts(word: AdminWord, drafts: FieldDrafts): AdminWord {
  return {
    ...word,
    english: drafts.english.trim().length ? drafts.english.trim() : null,
    exampleDe: drafts.exampleDe.trim().length ? drafts.exampleDe.trim() : null,
    exampleEn: drafts.exampleEn.trim().length ? drafts.exampleEn.trim() : null,
    sourcesCsv: drafts.sourcesCsv.trim().length ? drafts.sourcesCsv.trim() : null,
    praeteritum: drafts.praeteritum.trim().length ? drafts.praeteritum.trim() : null,
    partizipIi: drafts.partizipIi.trim().length ? drafts.partizipIi.trim() : null,
    perfekt: drafts.perfekt.trim().length ? drafts.perfekt.trim() : null,
    aux:
      drafts.aux === 'haben' || drafts.aux === 'sein' || drafts.aux === 'haben / sein'
        ? drafts.aux
        : null,
    gender: drafts.gender.trim().length ? drafts.gender.trim() : null,
    plural: drafts.plural.trim().length ? drafts.plural.trim() : null,
    comparative: drafts.comparative.trim().length ? drafts.comparative.trim() : null,
    superlative: drafts.superlative.trim().length ? drafts.superlative.trim() : null,
  };
}

function computeCompletenessWithDraft(word: AdminWord, drafts: FieldDrafts): boolean {
  const merged = mergeWordWithDrafts(word, drafts);
  return getMissingFields(merged).length === 0;
}

function buildPatchFromDrafts(
  word: AdminWord,
  drafts: FieldDrafts,
  preview?: WordEnrichmentPreview | null,
): EnrichmentPatch {
  const patch: EnrichmentPatch = {};

  type StringField =
    | 'english'
    | 'exampleDe'
    | 'exampleEn'
    | 'sourcesCsv'
    | 'praeteritum'
    | 'partizipIi'
    | 'perfekt'
    | 'gender'
    | 'plural'
    | 'comparative'
    | 'superlative';

  const applyField = (field: StringField) => {
    const draftValue = drafts[field].trim();
    const currentValue = (word[field] ?? '').trim();

    if (!draftValue.length) {
      if (word[field]) {
        patch[field] = null;
      }
      return;
    }

    if (draftValue !== currentValue) {
      patch[field] = draftValue;
    }
  };

  applyField('english');
  applyField('exampleDe');
  applyField('exampleEn');
  applyField('sourcesCsv');
  applyField('praeteritum');
  applyField('partizipIi');
  applyField('perfekt');
  applyField('gender');
  applyField('plural');
  applyField('comparative');
  applyField('superlative');

  const auxDraft = drafts.aux.trim().toLowerCase();
  let auxNormalised: string | null = null;
  if (auxDraft === 'haben' || auxDraft === 'sein') {
    auxNormalised = auxDraft;
  } else if (auxDraft.replace(/\s+/g, '') === 'haben/sein') {
    auxNormalised = 'haben / sein';
  }
  const currentAux = (word.aux ?? '').toLowerCase();
  if (!auxNormalised) {
    if (word.aux) {
      patch.aux = null;
    }
  } else if (auxNormalised !== currentAux) {
    patch.aux = auxNormalised as EnrichmentPatch['aux'];
  }

  const nextComplete = computeCompletenessWithDraft(word, drafts);
  if (word.complete !== nextComplete) {
    patch.complete = nextComplete;
  }

  if (preview?.patch.translations !== undefined) {
    patch.translations = preview.patch.translations ?? null;
  }
  if (preview?.patch.examples !== undefined) {
    patch.examples = preview.patch.examples ?? null;
  }
  if (preview?.patch.posAttributes !== undefined) {
    patch.posAttributes = preview.patch.posAttributes ?? null;
  }

  return patch;
}

function hasPatchChanges(patch: EnrichmentPatch): boolean {
  return Object.values(patch).some((value) => value !== undefined);
}

function findMatchingTranslationOptionId(
  value: EnrichmentPatch['english'],
  options: EnrichmentTranslationCandidate[],
): string | undefined {
  if (value === undefined || value === null) {
    return value === null ? MANUAL_OPTION : undefined;
  }

  const trimmed = value.trim();
  const matchIndex = options.findIndex((candidate) => candidate.value.trim() === trimmed);
  return matchIndex >= 0 ? `translation-${matchIndex}` : MANUAL_OPTION;
}

function findMatchingExampleOptionId(
  value: EnrichmentPatch['exampleDe'] | EnrichmentPatch['exampleEn'],
  options: EnrichmentExampleCandidate[],
  field: 'exampleDe' | 'exampleEn',
): string | undefined {
  if (value === undefined || value === null) {
    return value === null ? MANUAL_OPTION : undefined;
  }

  const trimmed = value.trim();
  const matchIndex = options.findIndex((candidate) => {
    const candidateValue = candidate[field];
    return candidateValue ? candidateValue.trim() === trimmed : false;
  });
  if (matchIndex >= 0) {
    return `example-${matchIndex}`;
  }
  return MANUAL_OPTION;
}

function findMatchingVerbFormOptionId(
  value:
    | EnrichmentPatch['praeteritum']
    | EnrichmentPatch['partizipIi']
    | EnrichmentPatch['perfekt']
    | EnrichmentPatch['aux'],
  options: EnrichmentVerbFormSuggestion[],
  field: 'praeteritum' | 'partizipIi' | 'perfekt' | 'aux',
): string | undefined {
  if (value === undefined || value === null) {
    return value === null ? MANUAL_OPTION : undefined;
  }

  const trimmed = value.trim();
  if (!trimmed.length) {
    return MANUAL_OPTION;
  }

  const normalised = trimmed.toLowerCase();
  const matchIndex = options.findIndex((candidate) => {
    const candidateValue = candidate[field];
    if (field === 'aux') {
      const target = normalised.replace(/\s+/g, '');
      const candidates: string[] = [];
      if (typeof candidateValue === 'string') {
        candidates.push(candidateValue);
      }
      if (candidate.auxiliaries?.length) {
        candidates.push(candidate.auxiliaries.join(' / '));
      }
      return candidates.some((entry) => entry.replace(/\s+/g, '').toLowerCase() === target);
    }
    if (typeof candidateValue !== 'string') {
      return false;
    }
    return candidateValue.trim().toLowerCase() === normalised;
  });
  return matchIndex >= 0 ? `verb-${matchIndex}` : MANUAL_OPTION;
}

function findMatchingGenderOptionId(
  value: EnrichmentPatch['gender'],
  suggestions: EnrichmentNounFormSuggestion[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return MANUAL_OPTION;
  }
  const normalised = normaliseGenderCandidateValue(value);
  if (!normalised) {
    return MANUAL_OPTION;
  }
  for (let index = 0; index < suggestions.length; index += 1) {
    const candidate = suggestions[index];
    const values = extractGenderValues(candidate);
    const matchIndex = values.findIndex((entry) => entry === normalised);
    if (matchIndex >= 0) {
      return buildGenderOptionId(index, matchIndex);
    }
  }
  return MANUAL_OPTION;
}

function findMatchingPluralOptionId(
  value: EnrichmentPatch['plural'],
  suggestions: EnrichmentNounFormSuggestion[],
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return MANUAL_OPTION;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return MANUAL_OPTION;
  }
  for (let index = 0; index < suggestions.length; index += 1) {
    const candidate = suggestions[index];
    const values = extractPluralValues(candidate);
    const matchIndex = values.findIndex((entry) => entry.value.trim().toLowerCase() === trimmed.toLowerCase());
    if (matchIndex >= 0) {
      return buildPluralOptionId(index, matchIndex);
    }
  }
  return MANUAL_OPTION;
}

function findMatchingAdjectiveOptionId(
  value: EnrichmentPatch['comparative'] | EnrichmentPatch['superlative'],
  suggestions: EnrichmentAdjectiveFormSuggestion[],
  field: 'comparative' | 'superlative',
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return MANUAL_OPTION;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return MANUAL_OPTION;
  }
  const listField = field === 'comparative' ? 'comparatives' : 'superlatives';
  for (let index = 0; index < suggestions.length; index += 1) {
    const candidate = suggestions[index];
    const values = extractAdjectiveValues(candidate, listField);
    const matchIndex = values.findIndex((entry) => entry.trim().toLowerCase() === trimmed.toLowerCase());
    if (matchIndex >= 0) {
      return buildAdjectiveOptionId(field, index, matchIndex);
    }
  }
  return MANUAL_OPTION;
}

