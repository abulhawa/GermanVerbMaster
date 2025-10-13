import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Wand2,
  UploadCloud,
  Sparkles,
  ListChecks,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useLocation, useSearch } from 'wouter';

import { AppShell } from '@/components/layout/app-shell';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { useAuthSession } from '@/auth/session';
import { wordsResponseSchema, type AdminWord, type WordsResponse } from './admin-word-schemas';
import type { BulkEnrichmentResponse, WordEnrichmentPreview } from '@shared/enrichment';
import {
  applyWordEnrichment,
  previewWordEnrichment,
  runBulkEnrichment,
  type ApplyEnrichmentResponse,
  type RunEnrichmentPayload,
  type WordEnrichmentOptions,
} from '@/lib/admin-enrichment';
import WordEnrichmentDetailView, {
  DEFAULT_WORD_CONFIG,
  formatDisplayDate,
  type WordConfigState,
} from './admin-enrichment-detail';
import {
  BooleanToggle,
  CollapsibleSection,
  formatMissingField,
  getMissingFields,
} from './admin-enrichment-shared';

const WORDS_PER_SEARCH = 10;
const MISSING_WORDS_PER_PAGE_OPTIONS = [10, 25, 50, 100] as const;
const DEFAULT_MISSING_PER_PAGE = 25;

interface BulkConfigState extends RunEnrichmentPayload {
  limit: number;
  mode: 'non-canonical' | 'canonical' | 'all';
  onlyIncomplete: boolean;
  enableAi: boolean;
  allowOverwrite: boolean;
  collectSynonyms: boolean;
  collectExamples: boolean;
  collectTranslations: boolean;
}

const DEFAULT_BULK_CONFIG: BulkConfigState = {
  limit: 25,
  mode: 'non-canonical',
  onlyIncomplete: true,
  enableAi: false,
  allowOverwrite: false,
  collectSynonyms: true,
  collectExamples: true,
  collectTranslations: true,
};

const AdminEnrichmentPage = () => {
  const { data: session } = useAuthSession();
  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(session?.user?.role),
    [session?.user?.role],
  );
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();

  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('gvm-admin-token') ?? '');
  const normalizedAdminToken = adminToken.trim();
  useEffect(() => {
    localStorage.setItem('gvm-admin-token', normalizedAdminToken);
  }, [normalizedAdminToken]);

  const searchParams = useMemo(() => new URLSearchParams(searchString ?? ''), [searchString]);
  const wordParam = searchParams.get('word');
  const parsedWordId = wordParam ? Number.parseInt(wordParam, 10) : NaN;
  const selectedWordId = Number.isFinite(parsedWordId) && parsedWordId > 0 ? parsedWordId : null;
  const isDetailMode = selectedWordId !== null;

  const openWordDetails = useCallback(
    (wordId: number) => {
      const params = new URLSearchParams(searchParams);
      params.set('word', String(wordId));
      const queryString = params.toString();
      navigate(queryString ? `/admin/enrichment?${queryString}` : `/admin/enrichment?word=${wordId}`);
    },
    [navigate, searchParams],
  );

  const closeWordDetails = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.delete('word');
    const queryString = params.toString();
    navigate(queryString ? `/admin/enrichment?${queryString}` : '/admin/enrichment');
  }, [navigate, searchParams]);

  const [bulkConfig, setBulkConfig] = useState<BulkConfigState>(DEFAULT_BULK_CONFIG);
  const [bulkResult, setBulkResult] = useState<BulkEnrichmentResponse | null>(null);
  const [bulkReportDownload, setBulkReportDownload] = useState<
    { url: string; filename: string } | null
  >(null);
  const [isBulkOpen, setIsBulkOpen] = useState(true);
  const [isReviewOpen, setIsReviewOpen] = useState(true);
  const [isMissingOpen, setIsMissingOpen] = useState(true);

  const [wordConfig, setWordConfig] = useState<WordConfigState>(DEFAULT_WORD_CONFIG);
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [previewWord, setPreviewWord] = useState<AdminWord | null>(null);
  const [previewData, setPreviewData] = useState<WordEnrichmentPreview | null>(null);
  const [applyResult, setApplyResult] = useState<ApplyEnrichmentResponse | null>(null);
  const [missingPage, setMissingPage] = useState(1);
  const [missingPerPage, setMissingPerPage] = useState(DEFAULT_MISSING_PER_PAGE);

  useEffect(() => () => {
    if (bulkReportDownload?.url) {
      URL.revokeObjectURL(bulkReportDownload.url);
    }
  }, [bulkReportDownload]);

  const prepareBulkReportDownload = useCallback((data: BulkEnrichmentResponse) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const timestamp = new Date().toISOString().replace(/[:]/g, '-');
    const filename = `bulk-enrichment-${timestamp}.json`;

    setBulkReportDownload((previous) => {
      if (previous?.url) {
        URL.revokeObjectURL(previous.url);
      }
      const url = URL.createObjectURL(blob);
      return { url, filename };
    });
  }, []);

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const payload: RunEnrichmentPayload = {
        limit: bulkConfig.limit,
        mode: bulkConfig.mode,
        onlyIncomplete: bulkConfig.onlyIncomplete,
        enableAi: bulkConfig.enableAi,
        allowOverwrite: bulkConfig.allowOverwrite,
        collectSynonyms: bulkConfig.collectSynonyms,
        collectExamples: bulkConfig.collectExamples,
        collectTranslations: bulkConfig.collectTranslations,
      };
      return runBulkEnrichment(payload, normalizedAdminToken);
    },
    onSuccess: (data) => {
      setBulkResult(data);
      prepareBulkReportDownload(data);
      toast({
        title: 'Enrichment complete',
        description: `Proposed updates for ${data.updated} of ${data.scanned} scanned words`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Failed to run enrichment',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const searchQuery = useQuery<WordsResponse>({
    queryKey: ['admin-enrichment', 'search', searchTerm, normalizedAdminToken],
    queryFn: async () => {
      const params = new URLSearchParams({
        search: searchTerm,
        perPage: String(WORDS_PER_SEARCH),
        page: '1',
      });
      const headers: Record<string, string> = {};
      if (normalizedAdminToken) {
        headers['x-admin-token'] = normalizedAdminToken;
      }
      const response = await fetch(`/api/words?${params.toString()}`, { headers });
      if (!response.ok) {
        throw new Error(`Failed to load words (${response.status})`);
      }
      const payload = await response.json();
      return wordsResponseSchema.parse(payload);
    },
    enabled: !isDetailMode && Boolean(searchTerm.trim()),
  });

  const missingWordsQuery = useQuery<WordsResponse>({
    queryKey: [
      'admin-enrichment',
      'missing',
      { page: missingPage, perPage: missingPerPage, token: normalizedAdminToken },
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        canonical: 'false',
        complete: 'false',
        perPage: String(missingPerPage),
        page: String(missingPage),
      });
      const headers: Record<string, string> = {};
      if (normalizedAdminToken) {
        headers['x-admin-token'] = normalizedAdminToken;
      }
      const response = await fetch(`/api/words?${params.toString()}`, { headers });
      if (!response.ok) {
        throw new Error(`Failed to load missing words (${response.status})`);
      }
      const payload = await response.json();
      return wordsResponseSchema.parse(payload);
    },
    enabled: !isDetailMode,
  });

  useEffect(() => {
    const safePage = missingWordsQuery.data?.pagination.page;
    if (typeof safePage === 'number' && safePage !== missingPage) {
      setMissingPage(safePage);
    }
  }, [missingWordsQuery.data, missingPage]);

  useEffect(() => {
    setMissingPage(1);
  }, [normalizedAdminToken]);

  const missingWords = missingWordsQuery.data?.data ?? [];
  const missingPagination = missingWordsQuery.data?.pagination;
  const effectiveMissingPerPage = missingPagination?.perPage ?? missingPerPage;
  const currentMissingPage = missingPagination?.page ?? missingPage;
  const totalMissingPages = missingPagination?.totalPages ?? 0;
  const totalMissingWords = missingPagination?.total ?? 0;
  const missingRangeStart =
    totalMissingWords > 0 && missingWords.length > 0
      ? (currentMissingPage - 1) * effectiveMissingPerPage + 1
      : 0;
  const missingRangeEnd = missingRangeStart > 0 ? missingRangeStart + missingWords.length - 1 : 0;
  const missingSummaryText =
    totalMissingWords > 0 && missingRangeStart > 0
      ? `Showing ${missingRangeStart.toLocaleString()}–${missingRangeEnd.toLocaleString()} of ${totalMissingWords.toLocaleString()} words`
      : 'No non-canonical words with missing data were found.';
  const displayMissingPage = currentMissingPage > 0 ? currentMissingPage : 1;
  const displayTotalMissingPages =
    totalMissingPages > 0 ? totalMissingPages : Math.max(displayMissingPage, 1);
  const canGoToPreviousMissingPage = currentMissingPage > 1;
  const canGoToNextMissingPage =
    totalMissingPages > 0
      ? currentMissingPage < totalMissingPages
      : missingWords.length === effectiveMissingPerPage && missingWords.length > 0;
  const previewMutation = useMutation({
    mutationFn: async (word: AdminWord) => {
      setPreviewWord(word);
      setApplyResult(null);
      const options: WordEnrichmentOptions = {
        enableAi: wordConfig.enableAi,
        allowOverwrite: wordConfig.allowOverwrite,
        collectSynonyms: wordConfig.collectSynonyms,
        collectExamples: wordConfig.collectExamples,
        collectTranslations: wordConfig.collectTranslations,
      };
      const result = await previewWordEnrichment(word.id, options, normalizedAdminToken);
      setPreviewData(result);
      return result;
    },
    onError: (error) => {
      setPreviewData(null);
      toast({
        title: 'Failed to preview enrichment',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!previewWord || !previewData) {
        throw new Error('No enrichment preview available');
      }
      const result = await applyWordEnrichment(previewWord.id, previewData.patch, normalizedAdminToken);
      setApplyResult(result);
      toast({
        title: 'Enrichment applied',
        description: `Updated ${result.appliedFields.join(', ')}`,
      });
      return result;
    },
    onSuccess: () => {
      searchQuery.refetch();
      missingWordsQuery.refetch();
      setPreviewData(null);
      setPreviewWord(null);
    },
    onError: (error) => {
      toast({
        title: 'Failed to apply enrichment',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    },
  });

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = searchInput.trim();
    setPreviewData(null);
    setPreviewWord(null);
    setApplyResult(null);
    setSearchTerm(trimmed);
  };

  const renderUpdateSummary = (summary: WordEnrichmentPreview['summary']) => {
    if (!summary.updates.length) {
      return <span className="text-sm text-muted-foreground">No proposed changes</span>;
    }
    return (
      <ul className="space-y-1 text-sm">
        {summary.updates.map((update) => (
          <li key={`${summary.id}-${update.field}`} className="flex flex-col">
            <span className="font-medium">{update.field}</span>
            <span className="text-muted-foreground">
              {update.next === null ? '⟶ (remove)' : String(update.next)}
              {update.source ? ` · ${update.source}` : ''}
            </span>
          </li>
        ))}
      </ul>
    );
  };

  const handleWordClick = useCallback(
    (word: AdminWord) => {
      openWordDetails(word.id);
    },
    [openWordDetails],
  );

  if (isDetailMode && selectedWordId) {
    return (
      <AppShell
        sidebar={(
          <>
            {navigationItems.map((item) => (
              <SidebarNavButton
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                exact={item.exact}
              />
            ))}
          </>
        )}
        mobileNav={<MobileNavBar items={navigationItems} />}
      >
        <WordEnrichmentDetailView
          wordId={selectedWordId}
          adminToken={adminToken}
          normalizedAdminToken={normalizedAdminToken}
          onAdminTokenChange={setAdminToken}
          toast={toast}
          onClose={closeWordDetails}
          wordConfig={wordConfig}
          setWordConfig={setWordConfig}
        />
      </AppShell>
    );
  }

  return (
    <AppShell
      sidebar={(
        <>
          {navigationItems.map((item) => (
            <SidebarNavButton
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              exact={item.exact}
            />
          ))}
        </>
      )}
      mobileNav={<MobileNavBar items={navigationItems} />}
    >
      <div className="flex flex-col gap-6">
        <CollapsibleSection
          icon={Wand2}
          title="Bulk enrichment preview"
          description="Generate suggestions for multiple words without immediately applying them."
          open={isBulkOpen}
          onOpenChange={setIsBulkOpen}
          triggerId="bulk-enrichment"
          headerActions={
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <Label htmlFor="admin-token" className="text-sm text-muted-foreground">
                Admin token
              </Label>
              <Input
                id="admin-token"
                placeholder="Optional API token"
                value={adminToken}
                onChange={(event) => setAdminToken(event.target.value)}
                className="w-full sm:w-64"
              />
            </div>
          }
        >
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              bulkMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="bulk-limit">Word limit</Label>
              <Input
                id="bulk-limit"
                type="number"
                min={1}
                max={200}
                value={bulkConfig.limit}
                onChange={(event) =>
                  setBulkConfig((config) => ({
                    ...config,
                    limit: Math.max(1, Math.min(200, Number.parseInt(event.target.value, 10) || config.limit)),
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Mode</Label>
              <Select
                value={bulkConfig.mode}
                onValueChange={(value: BulkConfigState['mode']) =>
                  setBulkConfig((config) => ({ ...config, mode: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="non-canonical">Non-canonical only</SelectItem>
                  <SelectItem value="canonical">Canonical only</SelectItem>
                  <SelectItem value="all">All words</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <BooleanToggle
              label="Only incomplete entries"
              description="Skip words that already have full data"
              checked={bulkConfig.onlyIncomplete}
              onCheckedChange={(checked) =>
                setBulkConfig((config) => ({ ...config, onlyIncomplete: checked }))
              }
            />
            <BooleanToggle
              label="Allow overwrite"
              description="Replace existing translations/examples when higher confidence results are found"
              checked={bulkConfig.allowOverwrite}
              onCheckedChange={(checked) =>
                setBulkConfig((config) => ({ ...config, allowOverwrite: checked }))
              }
            />
            <BooleanToggle
              label="Collect synonyms"
              checked={bulkConfig.collectSynonyms}
              onCheckedChange={(checked) =>
                setBulkConfig((config) => ({ ...config, collectSynonyms: checked }))
              }
            />
            <BooleanToggle
              label="Collect example sentences"
              checked={bulkConfig.collectExamples}
              onCheckedChange={(checked) =>
                setBulkConfig((config) => ({ ...config, collectExamples: checked }))
              }
            />
            <BooleanToggle
              label="Collect translations"
              checked={bulkConfig.collectTranslations}
              onCheckedChange={(checked) =>
                setBulkConfig((config) => ({ ...config, collectTranslations: checked }))
              }
            />
            <BooleanToggle
              label="Use AI assistance"
              description="Requires the OPENAI_API_KEY environment variable"
              checked={bulkConfig.enableAi}
              onCheckedChange={(checked) =>
                setBulkConfig((config) => ({ ...config, enableAi: checked }))
              }
            />
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={bulkMutation.isPending}>
                {bulkMutation.isPending ? 'Running…' : 'Run enrichment'}
              </Button>
            </div>
          </form>

          {bulkResult && (
            <div className="space-y-4">
              <Separator />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  Suggested updates for {bulkResult.updated} of {bulkResult.scanned} scanned words
                </div>
                {bulkReportDownload ? (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={bulkReportDownload.url}
                      download={bulkReportDownload.filename}
                      aria-label="Download bulk enrichment results as JSON"
                    >
                      Download JSON report
                    </a>
                  </Button>
                ) : null}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Word</TableHead>
                    <TableHead>Missing fields</TableHead>
                    <TableHead>Proposed updates</TableHead>
                    <TableHead>Sources</TableHead>
                    <TableHead className="text-right">Review</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkResult.words.map((summary) => (
                    <TableRow key={summary.id}>
                      <TableCell className="space-y-1">
                        <div className="font-semibold">{summary.lemma}</div>
                        <div className="text-xs text-muted-foreground">{summary.pos}</div>
                        {summary.translation && (
                          <div className="text-xs text-muted-foreground">
                            ↦ {summary.translation.value}
                            {summary.translation.source ? ` · ${summary.translation.source}` : ''}
                          </div>
                        )}
                        {summary.example?.exampleDe && (
                          <div className="text-xs text-muted-foreground">Example: {summary.example.exampleDe}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        {summary.missingFields.length ? (
                          <div className="flex flex-wrap gap-1">
                            {summary.missingFields.map((field) => (
                              <Badge key={field} variant="secondary">
                                {field}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">None</span>
                        )}
                      </TableCell>
                      <TableCell>{renderUpdateSummary(summary)}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground space-y-1">
                          {summary.sources.length ? (
                            <div>Sources: {summary.sources.join(', ')}</div>
                          ) : (
                            <div>No sources recorded</div>
                          )}
                          {summary.errors?.length ? (
                            <div className="text-destructive">Errors: {summary.errors.join('; ')}</div>
                          ) : null}
                          {summary.aiUsed ? <div>Used AI assistance</div> : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => openWordDetails(summary.id)}>
                          Review details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          icon={UploadCloud}
          title="Review &amp; apply per-word enrichment"
          description="Search for a single word, preview suggested updates, and apply them after manual review."
          open={isReviewOpen}
          onOpenChange={setIsReviewOpen}
          triggerId="per-word-review"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <BooleanToggle
              label="Use AI assistance"
              checked={wordConfig.enableAi}
              onCheckedChange={(checked) =>
                setWordConfig((config) => ({ ...config, enableAi: checked }))
              }
            />
            <BooleanToggle
              label="Allow overwrite"
              checked={wordConfig.allowOverwrite}
              onCheckedChange={(checked) =>
                setWordConfig((config) => ({ ...config, allowOverwrite: checked }))
              }
            />
            <BooleanToggle
              label="Collect synonyms"
              checked={wordConfig.collectSynonyms}
              onCheckedChange={(checked) =>
                setWordConfig((config) => ({ ...config, collectSynonyms: checked }))
              }
            />
            <BooleanToggle
              label="Collect example sentences"
              checked={wordConfig.collectExamples}
              onCheckedChange={(checked) =>
                setWordConfig((config) => ({ ...config, collectExamples: checked }))
              }
            />
            <BooleanToggle
              label="Collect translations"
              checked={wordConfig.collectTranslations}
              onCheckedChange={(checked) =>
                setWordConfig((config) => ({ ...config, collectTranslations: checked }))
              }
            />
          </div>

          <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSearchSubmit}>
            <Input
              placeholder="Search lemma or English translation"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <Button type="submit" variant="secondary" disabled={!searchInput.trim()}>
              Search
            </Button>
          </form>

          {searchQuery.isFetching ? (
            <p className="text-sm text-muted-foreground">Loading words…</p>
          ) : null}

            {searchQuery.isError ? (
              <p className="text-sm text-destructive">
                {searchQuery.error instanceof Error ? searchQuery.error.message : 'Failed to load words'}
              </p>
            ) : null}

          {searchQuery.isSuccess && searchQuery.data.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No words found for that search.</p>
          ) : null}

          {searchQuery.data?.data.length ? (
            <div className="space-y-3">
              {searchQuery.data.data.map((word) => (
                <div
                  key={word.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="font-medium">
                      {word.lemma} <span className="text-xs text-muted-foreground">({word.pos})</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      English: {word.english ?? '—'} · Example: {word.exampleDe ?? '—'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => handleWordClick(word)}>
                      Open detail page
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => previewMutation.mutate(word)}
                      disabled={previewMutation.isPending && previewWord?.id === word.id}
                    >
                      {previewMutation.isPending && previewWord?.id === word.id ? 'Loading…' : 'Preview enrichment'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {previewWord && previewData && (
            <div className="space-y-4 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">{previewWord.lemma}</h3>
                  <p className="text-sm text-muted-foreground">
                    Proposed updates for {previewWord.pos} · Missing fields{' '}
                    {previewData.summary.missingFields.length
                      ? previewData.summary.missingFields.join(', ')
                      : 'none'}
                  </p>
                </div>
                <div className="flex gap-2">
                  {previewData.summary.sources.map((source) => (
                    <Badge key={source} variant="secondary">
                      {source}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium">Translation &amp; examples</h4>
                  {previewData.summary.translation ? (
                    <div className="text-sm text-muted-foreground">
                      Translation: {previewData.summary.translation.value}
                      {previewData.summary.translation.source
                        ? ` · ${previewData.summary.translation.source}`
                        : ''}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No translation found</div>
                  )}
                  {previewData.summary.example ? (
                    <div className="text-sm text-muted-foreground">
                      Example: {previewData.summary.example.exampleDe ?? '—'}
                      {previewData.summary.example.exampleEn
                        ? ` / ${previewData.summary.example.exampleEn}`
                        : ''}
                      {previewData.summary.example.source ? ` · ${previewData.summary.example.source}` : ''}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No example suggested</div>
                  )}
                  {previewData.summary.synonyms.length ? (
                    <div className="text-sm text-muted-foreground">
                      Synonyms: {previewData.summary.synonyms.join(', ')}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Proposed field updates</h4>
                  {renderUpdateSummary(previewData.summary)}
                  {previewData.summary.errors?.length ? (
                    <div className="text-sm text-destructive">
                      {previewData.summary.errors.join(' • ')}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {previewData.hasUpdates
                    ? 'Review the updates below and apply them once you are satisfied.'
                    : 'No updates were suggested for this word.'}
                </p>
                <Button
                  onClick={() => applyMutation.mutate()}
                  disabled={!previewData.hasUpdates || applyMutation.isPending}
                >
                  {applyMutation.isPending ? 'Applying…' : 'Apply updates'}
                </Button>
              </div>
            </div>
          )}

          {applyResult && (
            <p className="text-sm text-muted-foreground">
              Applied fields: {applyResult.appliedFields.join(', ')}
            </p>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          icon={ListChecks}
          title="Words missing information"
          description="Browse non-canonical entries that still need translations or examples."
          open={isMissingOpen}
          onOpenChange={setIsMissingOpen}
          triggerId="missing-words"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">{missingSummaryText}</p>
            <div className="flex items-center gap-2">
              <Label htmlFor="missing-per-page" className="text-sm text-muted-foreground">
                Words per page
              </Label>
              <Select
                value={String(missingPerPage)}
                onValueChange={(value) => {
                  const next = Number.parseInt(value, 10);
                  setMissingPerPage(Number.isFinite(next) ? next : DEFAULT_MISSING_PER_PAGE);
                  setMissingPage(1);
                }}
              >
                <SelectTrigger id="missing-per-page" className="w-32">
                  <SelectValue placeholder="Select amount" />
                </SelectTrigger>
                <SelectContent>
                  {MISSING_WORDS_PER_PAGE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option} per page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {missingWordsQuery.isFetching ? (
            <p className="text-sm text-muted-foreground">Loading words…</p>
          ) : null}

          {missingWordsQuery.isError ? (
            <p className="text-sm text-destructive">
              {missingWordsQuery.error instanceof Error
                ? missingWordsQuery.error.message
                : 'Failed to load words'}
            </p>
          ) : null}

          {!missingWordsQuery.isFetching && !missingWordsQuery.isError && !missingWords.length ? (
            <p className="text-sm text-muted-foreground">
              No non-canonical words are currently missing required data.
            </p>
          ) : null}

          {missingWords.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Word</TableHead>
                  <TableHead>Missing fields</TableHead>
                  <TableHead>Available data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {missingWords.map((word) => {
                  const missingFields = getMissingFields(word);
                  return (
                    <TableRow
                      key={word.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleWordClick(word)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          handleWordClick(word);
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <TableCell className="space-y-1">
                        <div className="font-semibold">{word.lemma}</div>
                        <div className="text-xs text-muted-foreground">
                          {word.pos} · Level {word.level ?? '—'}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Updated {formatDisplayDate(word.updatedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        {missingFields.length ? (
                          <div className="flex flex-wrap gap-1">
                            {missingFields.map((field) => (
                              <Badge key={field} variant="secondary">
                                {formatMissingField(field)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No missing fields</span>
                        )}
                      </TableCell>
                      <TableCell className="space-y-1 text-xs text-muted-foreground">
                        <div>English: {word.english ?? '—'}</div>
                        <div>Example (DE): {word.exampleDe ?? '—'}</div>
                        <div>Example (EN): {word.exampleEn ?? '—'}</div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Page {displayMissingPage.toLocaleString()} of {displayTotalMissingPages.toLocaleString()} ·{' '}
              {totalMissingWords.toLocaleString()} total words
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setMissingPage((page) => Math.max(1, page - 1))}
                disabled={!canGoToPreviousMissingPage || missingWordsQuery.isFetching}
              >
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden />
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setMissingPage((page) =>
                    totalMissingPages > 0 ? Math.min(page + 1, totalMissingPages) : page + 1,
                  )
                }
                disabled={!canGoToNextMissingPage || missingWordsQuery.isFetching}
              >
                Next
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </CollapsibleSection>
      </div>

    </AppShell>
  );
};

export default AdminEnrichmentPage;
