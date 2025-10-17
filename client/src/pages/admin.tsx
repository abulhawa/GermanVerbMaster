import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks, Sparkles, Settings2, PenSquare, Trash2, Wand2 } from 'lucide-react';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';

import { AppShell } from '@/components/layout/app-shell';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { Word } from '@shared';
import { exportStatusSchema, wordSchema, wordsResponseSchema } from './admin-word-schemas';
import WordEnrichmentDetailView, {
  DEFAULT_WORD_CONFIG,
  type WordConfigState,
} from './admin-enrichment-detail';

type ApprovalFilter = 'all' | 'approved' | 'pending';
type CompleteFilter = 'all' | 'complete' | 'incomplete';
type EnrichmentFilter = 'all' | 'enriched' | 'unenriched';

const PER_PAGE_OPTIONS = [25, 50, 100, 200] as const;

const POS_OPTIONS: Array<{ label: string; value: Word['pos'] | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Verbs', value: 'V' },
  { label: 'Nouns', value: 'N' },
  { label: 'Adjectives', value: 'Adj' },
  { label: 'Adverbs', value: 'Adv' },
  { label: 'Pronouns', value: 'Pron' },
  { label: 'Determiners', value: 'Det' },
  { label: 'Prepositions', value: 'Präp' },
  { label: 'Conjunctions', value: 'Konj' },
  { label: 'Numbers', value: 'Num' },
  { label: 'Particles', value: 'Part' },
  { label: 'Interjections', value: 'Interj' },
];

const LEVEL_OPTIONS = ['All', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const completeOptions: Array<{ label: string; value: CompleteFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Complete', value: 'complete' },
  { label: 'Incomplete', value: 'incomplete' },
];

const enrichmentOptions: Array<{ label: string; value: EnrichmentFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Enriched', value: 'enriched' },
  { label: 'Needs enrichment', value: 'unenriched' },
];

function humanizeEnrichmentMethod(method: Word['enrichmentMethod'] | null | undefined) {
  if (!method) return null;
  return method
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const AdminWordsPage = () => {
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<Word['pos'] | 'ALL'>('ALL');
  const [level, setLevel] = useState<string>('All');
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>('all');
  const [completeFilter, setCompleteFilter] = useState<CompleteFilter>('all');
  const [enrichmentFilter, setEnrichmentFilter] = useState<EnrichmentFilter>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(50);
  const [wordConfig, setWordConfig] = useState<WordConfigState>(DEFAULT_WORD_CONFIG);
  const [enrichmentWordId, setEnrichmentWordId] = useState<number | null>(null);

  const pageDebugId = 'admin-words';

  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPage(1);
  }, [search, pos, level, approvalFilter, completeFilter, enrichmentFilter]);

  const filters = useMemo(
    () => ({
      search,
      pos,
      level,
      approvalFilter,
      completeFilter,
      enrichmentFilter,
      page,
      perPage,
    }),
    [search, pos, level, approvalFilter, completeFilter, enrichmentFilter, page, perPage],
  );

  const queryKey = useMemo(() => ['words', filters], [filters]);

  const exportStatusQueryKey = useMemo(() => ['export-status'], []);

  const enrichmentDialogOpen = enrichmentWordId !== null;

  const wordsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ admin: '1' });
      if (filters.pos !== 'ALL') params.set('pos', filters.pos);
      if (filters.level !== 'All') params.set('level', filters.level);
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.approvalFilter === 'approved') params.set('approved', 'true');
      if (filters.approvalFilter === 'pending') params.set('approved', 'false');
      if (filters.completeFilter === 'complete') params.set('complete', 'only');
      if (filters.completeFilter === 'incomplete') params.set('complete', 'non');
      if (filters.enrichmentFilter === 'enriched') params.set('enriched', 'only');
      if (filters.enrichmentFilter === 'unenriched') params.set('enriched', 'non');

      params.set('page', String(filters.page));
      params.set('perPage', String(filters.perPage));

      const response = await fetch(`/api/words?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Failed to load words (${response.status})`);
      }

      const payload = await response.json();
      const parsed = wordsResponseSchema.parse(payload);
      return parsed;
    },
  });

  const exportStatusQuery = useQuery({
    queryKey: exportStatusQueryKey,
    queryFn: async () => {
      const response = await fetch('/api/admin/export/status');
      if (!response.ok) {
        const error = new Error(`Failed to load export status (${response.status})`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }

      const payload = await response.json();
      return exportStatusSchema.parse(payload);
    },
    retry(failureCount, error) {
      if (error instanceof Error && (error as Error & { status?: number }).status === 401) {
        return false;
      }
      return failureCount < 2;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => {
      const response = await fetch(`/api/words/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to update word');
      }

      const result = await response.json();
      return wordSchema.parse(result);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: exportStatusQueryKey });
      toast({ title: 'Word updated' });
    },
    onError: (error) => {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    },
  });

  const bulkExportMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (filters.pos !== 'ALL') {
        body.pos = filters.pos;
      }

      const response = await fetch('/api/admin/export/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const message = await response.text();
        const error = new Error(message || `Bulk export failed (${response.status})`);
        (error as Error & { status?: number }).status = response.status;
        throw error;
      }

      return response.json() as Promise<{ succeeded: number; failed: number }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: exportStatusQueryKey });
      toast({ title: 'Export complete' });
    },
    onError: (error) => {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  });

  const bulkApproveMutation = useMutation<{ updated: number }, Error, number[]>({
    mutationFn: async (wordIds) => {
      if (!wordIds.length) {
        return { updated: 0 };
      }

      const response = await fetch('/api/admin/words/bulk-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordIds }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Bulk approval failed (${response.status})`);
      }

      return (await response.json()) as { updated: number };
    },
    onSuccess: (data, wordIds) => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: exportStatusQueryKey });
      const { updated } = data;
      if (updated > 0) {
        toast({
          title: updated === 1 ? 'Word approved' : 'Words approved',
          description: `Marked ${updated.toLocaleString()} of ${wordIds.length.toLocaleString()} selected word${
            updated === 1 ? '' : 's'
          } as approved.`,
        });
      } else {
        toast({
          title: 'No words approved',
          description: 'All selected words were already approved.',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Bulk approval failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  });

  const openEnrichmentDialog = (word: Word) => {
    setEnrichmentWordId(word.id);
  };

  const closeEnrichmentDialog = () => {
    setEnrichmentWordId(null);
  };

  const toggleApproval = (word: Word) => {
    updateMutation.mutate({ id: word.id, payload: { approved: !word.approved } });
  };

  const words = wordsQuery.data?.data ?? [];
  const pagination = wordsQuery.data?.pagination;
  const activePos = pos;

  const totalWords = pagination?.total ?? 0;
  const totalPages = pagination?.totalPages ?? 0;
  const currentPage = pagination?.page ?? page;
  const currentPerPage = pagination?.perPage ?? perPage;
  const displayTotalPages = totalPages > 0 ? totalPages : 1;
  const pageStart = totalWords > 0 ? (currentPage - 1) * currentPerPage + 1 : 0;
  const pageEnd = totalWords > 0 ? pageStart + words.length - 1 : 0;

  const wordsError =
    wordsQuery.isError && wordsQuery.error instanceof Error ? wordsQuery.error : null;

  const pendingWordsOnPage = useMemo(() => words.filter((word) => !word.approved), [words]);
  const pendingWordCount = pendingWordsOnPage.length;

  const exportStatus = exportStatusQuery.data;
  const totalDirty = exportStatus?.totalDirty ?? 0;
  const oldestDirty = exportStatus?.oldestDirtyUpdatedAt ?? null;
  const exportStatusError =
    exportStatusQuery.isError && exportStatusQuery.error instanceof Error
      ? exportStatusQuery.error
      : null;

  const columns = useMemo(() => {
    const base = [
      { key: 'lemma', label: 'Lemma' },
      { key: 'pos', label: 'POS' },
      { key: 'level', label: 'Level' },
      { key: 'english', label: 'English' },
    ];

    if (activePos === 'V') {
      base.push(
        { key: 'praeteritum', label: 'Präteritum' },
        { key: 'partizipIi', label: 'Partizip II' },
        { key: 'perfekt', label: 'Perfekt' },
        { key: 'aux', label: 'Aux' },
      );
    } else if (activePos === 'N') {
      base.push(
        { key: 'gender', label: 'Gender' },
        { key: 'plural', label: 'Plural' },
      );
    } else if (activePos === 'Adj') {
      base.push(
        { key: 'comparative', label: 'Comparative' },
        { key: 'superlative', label: 'Superlative' },
      );
    } else {
      base.push(
        { key: 'exampleDe', label: 'Example (DE)' },
        { key: 'exampleEn', label: 'Example (EN)' },
      );
    }

    base.push({ key: 'approval', label: 'Approval' });
    base.push({ key: 'complete', label: 'Complete' });
    base.push({ key: 'exportStatus', label: 'Export' });
    base.push({ key: 'enrichmentAppliedAt', label: 'Enriched' });
    base.push({ key: 'actions', label: 'Actions' });

    return base;
  }, [activePos]);

  const enrichmentDateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [],
  );

  const navigationItems = useMemo(() => getPrimaryNavigationItems(), []);

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="grid gap-2">
            {navigationItems.map((item) => (
              <SidebarNavButton
                key={item.href}
                href={item.href}
                icon={item.icon}
                label={item.label}
                exact={item.exact}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell
      sidebar={sidebar}
      mobileNav={<MobileNavBar items={navigationItems} />}
    >
      <div className="space-y-6">
        <section className="space-y-4 rounded-3xl border border-border/60 bg-card/85 p-6 shadow-soft shadow-primary/5">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Admin console</p>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
              <Settings2 className="h-6 w-6 text-primary" aria-hidden />
              Lexicon management
            </h1>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Curate the verb bank, manage metadata, and keep entries aligned across CEFR levels.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <Link href="/admin/enrichment">
              <Button
                variant="secondary"
                className="rounded-2xl px-5"
                debugId={`${pageDebugId}-topbar-enrichment-button`}
              >
                Go to enrichment
              </Button>
            </Link>
          </div>
        </section>
        <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
          <CardHeader className="space-y-2">
            <CardTitle>Admin: Words</CardTitle>
            <CardDescription>Review and edit the aggregated lexicon. Filters update the API query in real time.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by lemma or English"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Part of speech</Label>
                <Select value={pos} onValueChange={(value) => setPos(value as Word['pos'] | 'ALL')}>
                  <SelectTrigger>
                    <SelectValue placeholder="POS" />
                  </SelectTrigger>
                  <SelectContent>
                    {POS_OPTIONS.map((option) => (
                      <SelectItem key={option.value || 'all'} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Level</Label>
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent>
                    {LEVEL_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Approval</Label>
                <div className="flex rounded-2xl border border-border/60 bg-card/60 p-1 shadow-sm">
                  <Button
                    size="sm"
                    variant={approvalFilter === 'all' ? 'default' : 'secondary'}
                    className="flex-1 rounded-2xl"
                    onClick={() => setApprovalFilter('all')}
                    debugId={`${pageDebugId}-approval-filter-all-button`}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={approvalFilter === 'approved' ? 'default' : 'secondary'}
                    className="flex-1 rounded-2xl"
                    onClick={() => setApprovalFilter('approved')}
                    debugId={`${pageDebugId}-approval-filter-approved-button`}
                  >
                    Approved
                  </Button>
                  <Button
                    size="sm"
                    variant={approvalFilter === 'pending' ? 'default' : 'secondary'}
                    className="flex-1 rounded-2xl"
                    onClick={() => setApprovalFilter('pending')}
                    debugId={`${pageDebugId}-approval-filter-pending-button`}
                  >
                    Pending
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Completeness</Label>
                <Select value={completeFilter} onValueChange={(value: CompleteFilter) => setCompleteFilter(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Completeness" />
                  </SelectTrigger>
                  <SelectContent>
                    {completeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Enrichment</Label>
                <Select
                  value={enrichmentFilter}
                  onValueChange={(value: EnrichmentFilter) => setEnrichmentFilter(value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Enrichment" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrichmentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

      <Card className="rounded-3xl border border-border/60 bg-card/85 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle>Words</CardTitle>
          <CardDescription>
            {wordsQuery.isLoading && 'Loading words…'}
            {wordsError && !wordsQuery.isLoading && (wordsError.message || 'Failed to load words.')}
            {wordsQuery.isSuccess &&
              (totalWords
                ? `Showing ${pageStart}–${pageEnd} of ${totalWords} words.`
                : 'No words match the current filters.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
            {exportStatusQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Checking export queue…</div>
            ) : exportStatusQuery.isSuccess ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export queue</div>
                  <div className="text-sm text-foreground">
                    {totalDirty > 0
                      ? `${totalDirty} entr${totalDirty === 1 ? 'y' : 'ies'} awaiting export`
                      : 'All changes exported'}
                  </div>
                  {totalDirty > 0 && oldestDirty ? (
                    <div className="text-xs text-muted-foreground">
                      Oldest update {formatDistanceToNow(oldestDirty, { addSuffix: true })}
                    </div>
                  ) : null}
                </div>
                <Button
                  className="rounded-2xl"
                  variant={totalDirty > 0 ? 'default' : 'secondary'}
                  onClick={() => bulkExportMutation.mutate()}
                  disabled={bulkExportMutation.isPending || totalDirty === 0}
                  debugId={`${pageDebugId}-bulk-export-button`}
                >
                  {bulkExportMutation.isPending ? 'Exporting…' : 'Export all'}
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {exportStatusError?.message ?? 'Failed to load export status.'}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Bulk approval
                </div>
                <div className="text-sm text-foreground">
                  {pendingWordCount > 0
                    ? `${pendingWordCount.toLocaleString()} pending word${pendingWordCount === 1 ? '' : 's'} on this page`
                    : 'All visible words are approved'}
                </div>
              </div>
              <Button
                className="rounded-2xl"
                variant={pendingWordCount > 0 ? 'default' : 'secondary'}
                onClick={() => {
                  if (pendingWordCount > 0) {
                    bulkApproveMutation.mutate(pendingWordsOnPage.map((word) => word.id));
                  }
                }}
                disabled={pendingWordCount === 0 || bulkApproveMutation.isPending}
                debugId={`${pageDebugId}-bulk-approve-button`}
              >
                {bulkApproveMutation.isPending ? (
                  'Approving…'
                ) : (
                  <>
                    <ListChecks className="mr-2 h-4 w-4" aria-hidden />
                    Approve visible pending
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">Page {currentPage} of {displayTotalPages}</div>
            <div className="flex items-center gap-2">
              <Label className="text-sm" htmlFor="per-page">
                Rows per page
              </Label>
              <Select
                value={String(perPage)}
                onValueChange={(value) => {
                  const next = Number.parseInt(value, 10) || perPage;
                  setPerPage(next);
                  setPage(1);
                }}
              >
                <SelectTrigger id="per-page" className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PER_PAGE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="max-h-[520px] overflow-auto rounded-3xl border border-border/60">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-20 bg-card/95 backdrop-blur">
                <TableRow>
                  {columns.map((column) => (
                    <TableHead
                      key={column.key}
                      className="px-2 py-2 text-xs font-semibold uppercase tracking-wide"
                    >
                      {column.label}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
              {words.map((word) => {
                const enrichmentLabel = humanizeEnrichmentMethod(word.enrichmentMethod);
                return (
                  <TableRow key={word.id}>
                    <TableCell className="px-2 py-2 font-medium">{word.lemma}</TableCell>
                    <TableCell className="px-2 py-2">{word.pos}</TableCell>
                    <TableCell className="px-2 py-2">{word.level ?? '—'}</TableCell>
                    <TableCell className="px-2 py-2">{word.english ?? '—'}</TableCell>
                    {activePos === 'V' && (
                      <>
                        <TableCell className="px-2 py-2">{word.praeteritum ?? '—'}</TableCell>
                        <TableCell className="px-2 py-2">{word.partizipIi ?? '—'}</TableCell>
                        <TableCell className="px-2 py-2">{word.perfekt ?? '—'}</TableCell>
                        <TableCell className="px-2 py-2">{word.aux ?? '—'}</TableCell>
                      </>
                    )}
                    {activePos === 'N' && (
                      <>
                        <TableCell className="px-2 py-2">{word.gender ?? '—'}</TableCell>
                        <TableCell className="px-2 py-2">{word.plural ?? '—'}</TableCell>
                      </>
                    )}
                    {activePos === 'Adj' && (
                      <>
                        <TableCell className="px-2 py-2">{word.comparative ?? '—'}</TableCell>
                        <TableCell className="px-2 py-2">{word.superlative ?? '—'}</TableCell>
                      </>
                    )}
                    {activePos === 'ALL' && (
                      <>
                        <TableCell className="px-2 py-2">{word.exampleDe ?? '—'}</TableCell>
                        <TableCell className="px-2 py-2">{word.exampleEn ?? '—'}</TableCell>
                      </>
                    )}
                    <TableCell className="px-2 py-2">
                      <Badge variant={word.approved ? 'default' : 'secondary'}>
                        {word.approved ? 'Approved' : 'Pending'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Badge variant={word.complete ? 'default' : 'outline'}>
                        {word.complete ? 'Complete' : 'Incomplete'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {(() => {
                        const exportedAt = word.exportedAt;
                        const updatedAt = word.updatedAt;
                        const isDirty = !exportedAt || exportedAt.getTime() < updatedAt.getTime();
                        if (isDirty) {
                          return <Badge variant="destructive">Dirty</Badge>;
                        }
                        if (exportedAt) {
                          return (
                            <span className="text-xs text-muted-foreground">
                              Exported {formatDistanceToNow(exportedAt, { addSuffix: true })}
                            </span>
                          );
                        }
                        return <Badge variant="secondary">Never exported</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {word.enrichmentAppliedAt ? (
                        <div className="flex flex-col">
                          <span>{enrichmentDateFormatter.format(word.enrichmentAppliedAt)}</span>
                          {enrichmentLabel ? (
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                              {enrichmentLabel}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="flex items-center gap-2 px-2 py-2">
                      <Button
                        size="icon"
                        variant={word.approved ? 'destructive' : 'secondary'}
                        className="rounded-xl"
                        title={word.approved ? 'Revoke approval' : 'Mark as approved'}
                        aria-label={word.approved ? 'Revoke approval' : 'Mark as approved'}
                        onClick={() => toggleApproval(word)}
                        debugId={`${pageDebugId}-word-${word.id}-toggle-approval-button`}
                      >
                        {word.approved ? (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        ) : (
                          <Sparkles className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="secondary"
                        className="rounded-xl"
                        asChild
                        title="Edit entry"
                        aria-label="Edit entry"
                        debugId={`${pageDebugId}-word-${word.id}-edit-button`}
                      >
                        <Link href={`/admin/words/${word.id}`}>
                          <PenSquare className="h-4 w-4" aria-hidden />
                        </Link>
                      </Button>
                      <Button
                        size="icon"
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => openEnrichmentDialog(word)}
                        title="Open enrichment"
                        aria-label="Open enrichment"
                        debugId={`${pageDebugId}-word-${word.id}-enrich-button`}
                      >
                        <Wand2 className="h-4 w-4" aria-hidden />
                      </Button>
                  </TableCell>
                  </TableRow>
                );
              })}
              {wordsError && !wordsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                    {wordsError.message || 'Failed to load words.'}
                  </TableCell>
                </TableRow>
              )}
              {!wordsError && !words.length && !wordsQuery.isLoading && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                    No words match the current filters.
                  </TableCell>
                </TableRow>
              )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {totalWords
                ? `Showing ${pageStart}–${pageEnd} of ${totalWords} words`
                : 'No words to display'}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={currentPage <= 1 || wordsQuery.isLoading}
                className="rounded-2xl"
                debugId={`${pageDebugId}-pagination-previous-button`}
              >
                Previous
              </Button>
              <div className="text-sm text-muted-foreground">Page {currentPage} of {displayTotalPages}</div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPage((current) => current + 1)}
                disabled={
                  wordsQuery.isLoading ||
                  (totalPages > 0 ? currentPage >= totalPages : !totalWords)
                }
                className="rounded-2xl"
                debugId={`${pageDebugId}-pagination-next-button`}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
      <Dialog
        open={enrichmentDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeEnrichmentDialog();
          }
        }}
      >
        <DialogContent className="w-full max-w-6xl overflow-hidden border border-border/60 bg-background p-0">
          <ScrollArea className="max-h-[80vh] w-full">
            {enrichmentWordId ? (
              <div className="space-y-6 px-6 py-6">
                <WordEnrichmentDetailView
                  key={enrichmentWordId}
                  wordId={enrichmentWordId}
                  toast={toast}
                  onClose={closeEnrichmentDialog}
                  wordConfig={wordConfig}
                  setWordConfig={setWordConfig}
                />
              </div>
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
};

export default AdminWordsPage;
