import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { Sparkles, Settings2, PenSquare, Trash2, Wand2 } from 'lucide-react';
import { Link } from 'wouter';

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
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuthSession } from '@/auth/session';
import type { Word } from '@shared';
import { wordSchema, wordsResponseSchema } from './admin-word-schemas';
import WordEnrichmentDetailView, {
  DEFAULT_WORD_CONFIG,
  type WordConfigState,
} from './admin-enrichment-detail';

type CanonicalFilter = 'all' | 'only' | 'non';
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

interface EditFieldConfig {
  key:
    | 'level'
    | 'english'
    | 'exampleDe'
    | 'exampleEn'
    | 'gender'
    | 'plural'
    | 'separable'
    | 'aux'
    | 'praesensIch'
    | 'praesensEr'
    | 'praeteritum'
    | 'partizipIi'
    | 'perfekt'
    | 'comparative'
    | 'superlative'
    | 'sourcesCsv'
    | 'sourceNotes';
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'boolean';
  options?: Array<{ label: string; value: string }>;
}

const commonFields: EditFieldConfig[] = [
  { key: 'level', label: 'Level' },
  { key: 'english', label: 'English' },
  { key: 'exampleDe', label: 'Example (DE)', type: 'textarea' },
  { key: 'exampleEn', label: 'Example (EN)', type: 'textarea' },
  { key: 'sourcesCsv', label: 'Sources' },
  { key: 'sourceNotes', label: 'Source notes', type: 'textarea' },
];

const verbFields: EditFieldConfig[] = [
  { key: 'aux', label: 'Auxiliary', type: 'select', options: [
    { label: 'Unset', value: 'unset' },
    { label: 'haben', value: 'haben' },
    { label: 'sein', value: 'sein' },
    { label: 'haben / sein', value: 'haben / sein' },
  ] },
  { key: 'separable', label: 'Separable', type: 'select', options: [
    { label: 'Unset', value: 'unset' },
    { label: 'Yes', value: 'true' },
    { label: 'No', value: 'false' },
  ] },
  { key: 'praesensIch', label: 'Präsens (ich)' },
  { key: 'praesensEr', label: 'Präsens (er/sie/es)' },
  { key: 'praeteritum', label: 'Präteritum' },
  { key: 'partizipIi', label: 'Partizip II' },
  { key: 'perfekt', label: 'Perfekt' },
];

const nounFields: EditFieldConfig[] = [
  { key: 'gender', label: 'Gender / Artikel' },
  { key: 'plural', label: 'Plural' },
];

const adjectiveFields: EditFieldConfig[] = [
  { key: 'comparative', label: 'Comparative' },
  { key: 'superlative', label: 'Superlative' },
];

const wordFormSchema = z.object({
  level: z.string(),
  english: z.string(),
  exampleDe: z.string(),
  exampleEn: z.string(),
  gender: z.string(),
  plural: z.string(),
  separable: z.string(),
  aux: z.string(),
  praesensIch: z.string(),
  praesensEr: z.string(),
  praeteritum: z.string(),
  partizipIi: z.string(),
  perfekt: z.string(),
  comparative: z.string(),
  superlative: z.string(),
  sourcesCsv: z.string(),
  sourceNotes: z.string(),
});

type WordFormState = z.infer<typeof wordFormSchema>;

function createFormState(word: Word): WordFormState {
  return {
    level: word.level ?? '',
    english: word.english ?? '',
    exampleDe: word.exampleDe ?? '',
    exampleEn: word.exampleEn ?? '',
    gender: word.gender ?? '',
    plural: word.plural ?? '',
    separable: word.separable === null ? 'unset' : word.separable ? 'true' : 'false',
    aux: word.aux ?? 'unset',
    praesensIch: word.praesensIch ?? '',
    praesensEr: word.praesensEr ?? '',
    praeteritum: word.praeteritum ?? '',
    partizipIi: word.partizipIi ?? '',
    perfekt: word.perfekt ?? '',
    comparative: word.comparative ?? '',
    superlative: word.superlative ?? '',
    sourcesCsv: word.sourcesCsv ?? '',
    sourceNotes: word.sourceNotes ?? '',
  };
}

function preparePayload(form: WordFormState, pos: Word['pos']) {
  const payload: Record<string, unknown> = {};

  const assignText = (key: keyof WordFormState, column: keyof Word) => {
    const raw = form[key].trim();
    payload[column] = raw.length ? raw : null;
  };

  assignText('level', 'level');
  assignText('english', 'english');
  assignText('exampleDe', 'exampleDe');
  assignText('exampleEn', 'exampleEn');
  assignText('sourcesCsv', 'sourcesCsv');
  assignText('sourceNotes', 'sourceNotes');

  if (pos === 'V') {
    if (form.aux === 'unset') {
      payload.aux = null;
    } else if (
      form.aux === 'haben'
      || form.aux === 'sein'
      || form.aux === 'haben / sein'
    ) {
      payload.aux = form.aux;
    }

    if (form.separable === 'unset') {
      payload.separable = null;
    } else if (form.separable === 'true') {
      payload.separable = true;
    } else if (form.separable === 'false') {
      payload.separable = false;
    }

    assignText('praesensIch', 'praesensIch');
    assignText('praesensEr', 'praesensEr');
    assignText('praeteritum', 'praeteritum');
    assignText('partizipIi', 'partizipIi');
    assignText('perfekt', 'perfekt');
  }

  if (pos === 'N') {
    assignText('gender', 'gender');
    assignText('plural', 'plural');
  }

  if (pos === 'Adj') {
    assignText('comparative', 'comparative');
    assignText('superlative', 'superlative');
  }

  return payload;
}

function humanizeEnrichmentMethod(method: Word['enrichmentMethod'] | null | undefined) {
  if (!method) return null;
  return method
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

const AdminWordsPage = () => {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem('gvm-admin-token') ?? '');
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<Word['pos'] | 'ALL'>('ALL');
  const [level, setLevel] = useState<string>('All');
  const [canonicalFilter, setCanonicalFilter] = useState<CanonicalFilter>('all');
  const [completeFilter, setCompleteFilter] = useState<CompleteFilter>('all');
  const [enrichmentFilter, setEnrichmentFilter] = useState<EnrichmentFilter>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(50);
  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [formState, setFormState] = useState<WordFormState | null>(null);
  const [wordConfig, setWordConfig] = useState<WordConfigState>(DEFAULT_WORD_CONFIG);
  const [enrichmentWordId, setEnrichmentWordId] = useState<number | null>(null);

  const pageDebugId = 'admin-words';

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const normalizedAdminToken = adminToken.trim();

  useEffect(() => {
    localStorage.setItem('gvm-admin-token', normalizedAdminToken);
  }, [normalizedAdminToken]);

  useEffect(() => {
    setPage(1);
  }, [search, pos, level, canonicalFilter, completeFilter, enrichmentFilter]);

  const filters = useMemo(
    () => ({
      search,
      pos,
      level,
      canonicalFilter,
      completeFilter,
      enrichmentFilter,
      page,
      perPage,
    }),
    [search, pos, level, canonicalFilter, completeFilter, enrichmentFilter, page, perPage],
  );

  const queryKey = useMemo(
    () => ['words', filters, normalizedAdminToken],
    [filters, normalizedAdminToken],
  );

  const enrichmentDialogOpen = enrichmentWordId !== null;

  const wordsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ admin: '1' });
      if (filters.pos !== 'ALL') params.set('pos', filters.pos);
      if (filters.level !== 'All') params.set('level', filters.level);
      if (filters.search.trim()) params.set('search', filters.search.trim());
      if (filters.canonicalFilter === 'only') params.set('canonical', 'only');
      if (filters.canonicalFilter === 'non') params.set('canonical', 'non');
      if (filters.completeFilter === 'complete') params.set('complete', 'only');
      if (filters.completeFilter === 'incomplete') params.set('complete', 'non');
      if (filters.enrichmentFilter === 'enriched') params.set('enriched', 'only');
      if (filters.enrichmentFilter === 'unenriched') params.set('enriched', 'non');

      const headers: Record<string, string> = {};
      if (normalizedAdminToken) {
        headers['x-admin-token'] = normalizedAdminToken;
      }

      params.set('page', String(filters.page));
      params.set('perPage', String(filters.perPage));

      const response = await fetch(`/api/words?${params.toString()}`, {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to load words (${response.status})`);
      }

      const payload = await response.json();
      const parsed = wordsResponseSchema.parse(payload);
      return parsed;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Record<string, unknown> }) => {
      const response = await fetch(`/api/words/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(normalizedAdminToken ? { 'x-admin-token': normalizedAdminToken } : {}),
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
      toast({ title: 'Word updated' });
    },
    onError: (error) => {
      toast({ title: 'Update failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    },
  });

  const openEditor = (word: Word) => {
    setSelectedWord(word);
    setFormState(createFormState(word));
  };

  const closeEditor = () => {
    setSelectedWord(null);
    setFormState(null);
  };

  const openEnrichmentDialog = (word: Word) => {
    setEnrichmentWordId(word.id);
  };

  const closeEnrichmentDialog = () => {
    setEnrichmentWordId(null);
  };

  const submitForm = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedWord || !formState) return;

    const payload = preparePayload(formState, selectedWord.pos);
    updateMutation.mutate({ id: selectedWord.id, payload });
    closeEditor();
  };

  const toggleCanonical = (word: Word) => {
    updateMutation.mutate({ id: word.id, payload: { canonical: !word.canonical } });
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

  const isUnauthorized =
    wordsQuery.isError &&
    wordsQuery.error instanceof Error &&
    wordsQuery.error.message.includes('(401)');

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

    base.push({ key: 'canonical', label: 'Canonical' });
    base.push({ key: 'complete', label: 'Complete' });
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

  const { data: authSession } = useAuthSession();
  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession?.user.role ?? null),
    [authSession?.user.role],
  );

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
            <Link href="/">
              <Button
                variant="secondary"
                className="rounded-2xl px-5"
                debugId={`${pageDebugId}-topbar-back-button`}
              >
                Back to practice
              </Button>
            </Link>
            <Link href="/analytics">
              <Button className="rounded-2xl px-5" debugId={`${pageDebugId}-topbar-analytics-button`}>
                Open analytics
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
                <Label htmlFor="admin-token">Admin token (if configured)</Label>
                <Input
                  id="admin-token"
                  type="password"
                  value={adminToken}
                  onChange={(event) => setAdminToken(event.target.value)}
                  placeholder="Enter x-admin-token"
                />
              </div>
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
                <Label>Canonical</Label>
                <div className="flex rounded-2xl border border-border/60 bg-card/60 p-1 shadow-sm">
                  <Button
                    size="sm"
                    variant={canonicalFilter === 'all' ? 'default' : 'secondary'}
                    className="flex-1 rounded-2xl"
                    onClick={() => setCanonicalFilter('all')}
                    debugId={`${pageDebugId}-canonical-filter-all-button`}
                  >
                    All
                  </Button>
                  <Button
                    size="sm"
                    variant={canonicalFilter === 'only' ? 'default' : 'secondary'}
                    className="flex-1 rounded-2xl"
                    onClick={() => setCanonicalFilter('only')}
                    debugId={`${pageDebugId}-canonical-filter-only-button`}
                  >
                    Canonical
                  </Button>
                  <Button
                    size="sm"
                    variant={canonicalFilter === 'non' ? 'default' : 'secondary'}
                    className="flex-1 rounded-2xl"
                    onClick={() => setCanonicalFilter('non')}
                    debugId={`${pageDebugId}-canonical-filter-non-button`}
                  >
                    Non-canonical
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
            {isUnauthorized && 'Enter the admin token to load words.'}
            {wordsQuery.isLoading && 'Loading words…'}
            {wordsQuery.isError && !isUnauthorized && 'Failed to load words. Check the token and try again.'}
            {wordsQuery.isSuccess &&
              (totalWords
                ? `Showing ${pageStart}–${pageEnd} of ${totalWords} words.`
                : 'No words match the current filters.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
          <div className="max-h-[520px] overflow-hidden rounded-3xl border border-border/60">
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
                      <Badge variant={word.canonical ? 'default' : 'secondary'}>
                        {word.canonical ? 'Canonical' : 'Shadow'}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Badge variant={word.complete ? 'default' : 'outline'}>
                        {word.complete ? 'Complete' : 'Incomplete'}
                      </Badge>
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
                        variant={word.canonical ? 'destructive' : 'secondary'}
                        className="rounded-xl"
                        title={word.canonical ? 'Remove canonical flag' : 'Mark as canonical'}
                        aria-label={word.canonical ? 'Remove canonical flag' : 'Mark as canonical'}
                        onClick={() => toggleCanonical(word)}
                        debugId={`${pageDebugId}-word-${word.id}-toggle-canonical-button`}
                      >
                        {word.canonical ? (
                          <Trash2 className="h-4 w-4" aria-hidden />
                        ) : (
                          <Sparkles className="h-4 w-4" aria-hidden />
                        )}
                      </Button>
                      <Drawer open={selectedWord?.id === word.id} onOpenChange={(open) => {
                        if (open) {
                          openEditor(word);
                        } else {
                          closeEditor();
                        }
                      }}>
                        <DrawerTrigger asChild>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="rounded-xl"
                            onClick={() => openEditor(word)}
                            title="Edit entry"
                            aria-label="Edit entry"
                            debugId={`${pageDebugId}-word-${word.id}-edit-button`}
                          >
                            <PenSquare className="h-4 w-4" aria-hidden />
                          </Button>
                        </DrawerTrigger>
                        <DrawerContent className="max-h-[85vh] overflow-y-auto">
                          <DrawerHeader>
                            <DrawerTitle>Edit {word.lemma}</DrawerTitle>
                          </DrawerHeader>
                          <form onSubmit={submitForm} className="space-y-4 p-4">
                          {[...commonFields,
                            ...(word.pos === 'V' ? verbFields : []),
                            ...(word.pos === 'N' ? nounFields : []),
                            ...(word.pos === 'Adj' ? adjectiveFields : []),
                          ].map((field) => (
                            <div key={field.key} className="space-y-2">
                              <Label className="text-sm font-medium">{field.label}</Label>
                                {field.type === 'textarea' ? (
                                  <Textarea
                                    value={formState?.[field.key] ?? ''}
                                    onChange={(event) =>
                                      setFormState((state) =>
                                        state ? { ...state, [field.key]: event.target.value } : state,
                                      )
                                    }
                                  />
                                ) : field.type === 'select' && field.options ? (
                                  (() => {
                                    const fallbackOption =
                                      field.options.find((option) => option.value === 'unset')?.value ??
                                      field.options[0]?.value ??
                                      '';
                                    const currentValue = formState?.[field.key] ?? fallbackOption;
                                    return (
                                      <Select
                                        value={currentValue}
                                        onValueChange={(value) =>
                                          setFormState((state) =>
                                            state ? { ...state, [field.key]: value } : state,
                                          )
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {field.options.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                              {option.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    );
                                  })()
                                ) : (
                                  <Input
                                    value={formState?.[field.key] ?? ''}
                                    onChange={(event) =>
                                      setFormState((state) =>
                                      state ? { ...state, [field.key]: event.target.value } : state,
                                    )
                                  }
                                />
                              )}
                            </div>
                          ))}
                          <DrawerFooter>
                            <Button
                              type="submit"
                              disabled={updateMutation.isPending}
                              debugId={`${pageDebugId}-word-${word.id}-save-button`}
                            >
                              Save changes
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={closeEditor}
                              debugId={`${pageDebugId}-word-${word.id}-cancel-button`}
                            >
                              Cancel
                            </Button>
                          </DrawerFooter>
                        </form>
                      </DrawerContent>
                    </Drawer>
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
              {isUnauthorized && (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center text-muted-foreground">
                    Enter the admin token to load words.
                  </TableCell>
                </TableRow>
              )}
              {!isUnauthorized && !words.length && !wordsQuery.isLoading && (
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
        <DialogContent className="w-full max-w-6xl overflow-hidden border border-border/60 bg-card/95 p-0">
          <ScrollArea className="max-h-[80vh] w-full">
            {enrichmentWordId ? (
              <div className="space-y-6 px-6 py-6">
                <WordEnrichmentDetailView
                  key={enrichmentWordId}
                  wordId={enrichmentWordId}
                  adminToken={adminToken}
                  normalizedAdminToken={normalizedAdminToken}
                  onAdminTokenChange={setAdminToken}
                  toast={toast}
                  onClose={closeEnrichmentDialog}
                  wordConfig={wordConfig}
                  setWordConfig={setWordConfig}
                  autoPreview
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
