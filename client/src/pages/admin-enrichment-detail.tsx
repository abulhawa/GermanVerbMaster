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
  EnrichmentTranslationCandidate,
  EnrichmentVerbFormSuggestion,
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
}

const MANUAL_OPTION = 'manual';

const WordEnrichmentDetailView = ({
  wordId,
  adminToken,
  normalizedAdminToken,
  onAdminTokenChange,
  toast,
  onClose,
  wordConfig,
  setWordConfig,
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
  });
  const [selectedOptions, setSelectedOptions] = useState<{
    english?: string;
    exampleDe?: string;
    exampleEn?: string;
    praeteritum?: string;
    partizipIi?: string;
    perfekt?: string;
    aux?: string;
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

  const mergedWord = useMemo(() => (word ? mergeWordWithDrafts(word, drafts) : null), [word, drafts]);
  const missingBefore = useMemo(() => (word ? getMissingFields(word) : []), [word]);
  const missingAfter = useMemo(() => (mergedWord ? getMissingFields(mergedWord) : []), [mergedWord]);
  const nextComplete = useMemo(() => (word ? computeCompletenessWithDraft(word, drafts) : false), [word, drafts]);

  const hasPendingChanges = useMemo(() => {
    if (!word) return false;
    const patch = buildPatchFromDrafts(word, drafts);
    return hasPatchChanges(patch);
  }, [word, drafts]);

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

  const providerDiagnostics = previewData?.suggestions.providerDiagnostics ?? [];

  const handleDraftChange = (
    field: keyof FieldDrafts,
    value: string,
    optionsField?: 'english' | 'exampleDe' | 'exampleEn',
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
    | 'perfekt';

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

