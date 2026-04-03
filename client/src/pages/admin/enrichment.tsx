import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ListChecks, Settings2, Wand2 } from 'lucide-react';

import { useAuthSession } from '@/auth/session';
import { AppShell } from '@/components/layout/app-shell';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

import type { Word } from '@shared';

import { BooleanToggle, CollapsibleSection, formatMissingField, getMissingFields } from '../admin-enrichment-shared';
import type { BatchEnrichmentResponse } from './enrichment-schemas';
import { batchEnrichmentResponseSchema } from './enrichment-schemas';
import {
  ADMIN_TOKEN_STORAGE_KEY,
  LEVEL_OPTIONS,
  PER_PAGE_OPTIONS,
  POS_OPTIONS,
  type AdminWordFilters as AdminWordFiltersState,
} from './constants';
import { useAdminWordsQuery } from './hooks/use-admin-words-query';
import { useEnrichWordMutation } from './hooks/use-enrich-word-mutation';

type EnrichmentMode = 'pending' | 'approved' | 'all';

const MODE_OPTIONS: Array<{ label: string; value: EnrichmentMode }> = [
  { label: 'Pending only', value: 'pending' },
  { label: 'Approved only', value: 'approved' },
  { label: 'All words', value: 'all' },
];

function getFieldSummary(fields: string[]): string {
  if (!fields.length) {
    return 'No changes';
  }
  return fields.join(', ');
}

export default function AdminEnrichmentPage() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? '');
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<Word['pos'] | 'ALL'>('ALL');
  const [level, setLevel] = useState<string>('All');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState<number>(25);
  const [mode, setMode] = useState<EnrichmentMode>('pending');
  const [limit, setLimit] = useState(25);
  const [onlyIncomplete, setOnlyIncomplete] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [isBatchOpen, setIsBatchOpen] = useState(true);
  const [isQueueOpen, setIsQueueOpen] = useState(true);
  const [lastBatchResult, setLastBatchResult] = useState<BatchEnrichmentResponse | null>(null);

  const normalizedAdminToken = adminToken.trim();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: authSession } = useAuthSession();

  useEffect(() => {
    localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, normalizedAdminToken);
  }, [normalizedAdminToken]);

  useEffect(() => {
    setPage(1);
  }, [search, pos, level, perPage]);

  const navigationItems = useMemo(
    () => getPrimaryNavigationItems(authSession?.user.role ?? null),
    [authSession?.user.role],
  );

  const queueFilters = useMemo<AdminWordFiltersState>(
    () => ({
      search,
      pos,
      level,
      approvalFilter: 'pending',
      completeFilter: 'incomplete',
      page,
      perPage,
    }),
    [search, pos, level, page, perPage],
  );

  const candidateQuery = useAdminWordsQuery({
    token: normalizedAdminToken,
    filters: queueFilters,
  });

  const batchMutation = useMutation({
    mutationFn: async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (normalizedAdminToken) {
        headers['x-admin-token'] = normalizedAdminToken;
      }

      const response = await fetch('/api/admin/enrichment/run', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit,
          mode,
          onlyIncomplete,
          overwrite,
          ...(pos !== 'ALL' ? { pos } : {}),
          ...(level !== 'All' ? { level } : {}),
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => 'Failed to run enrichment');
        throw new Error(message || `Failed to run enrichment (${response.status})`);
      }

      const payload = await response.json();
      return batchEnrichmentResponseSchema.parse(payload);
    },
    onSuccess: (result) => {
      setLastBatchResult(result);
      void queryClient.invalidateQueries({ queryKey: ['admin-words'] });
      toast({
        title: 'Batch enrichment complete',
        description:
          result.updated > 0
            ? `Updated ${result.updated} of ${result.scanned} scanned words.`
            : `No updates were applied after scanning ${result.scanned} words.`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Batch enrichment failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  });

  const enrichMutation = useEnrichWordMutation({
    token: normalizedAdminToken,
    invalidateKey: candidateQuery.queryKey,
    onError: (error) => {
      toast({
        title: 'Word enrichment failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    },
  });

  const isUnauthorized =
    candidateQuery.isError &&
    candidateQuery.error instanceof Error &&
    candidateQuery.error.message.includes('(401)');

  const words = candidateQuery.data?.data ?? [];
  const pagination = candidateQuery.data?.pagination;
  const enrichingWordId = enrichMutation.isPending ? enrichMutation.variables?.id ?? null : null;

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="space-y-6">
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
  );

  return (
    <AppShell sidebar={sidebar} mobileNav={<MobileNavBar items={navigationItems} />}>
      <div className="space-y-6">
        <section className="space-y-4 rounded-3xl border border-border/60 bg-card/85 p-6 shadow-soft shadow-primary/5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Admin tools
              </p>
              <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
                <Settings2 className="h-6 w-6 text-primary" aria-hidden />
                Enrichment workspace
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Run Groq-backed enrichment in batches, then work through incomplete entries one by one.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/admin">
                <Button variant="secondary" className="rounded-2xl px-5">
                  Open word manager
                </Button>
              </Link>
              <Link href="/">
                <Button className="rounded-2xl px-5">Back to practice</Button>
              </Link>
            </div>
          </div>

          <div className="grid gap-2 lg:max-w-md">
            <Label htmlFor="admin-enrichment-token">Admin token (if configured)</Label>
            <Input
              id="admin-enrichment-token"
              type="password"
              value={adminToken}
              onChange={(event) => setAdminToken(event.target.value)}
              placeholder="Enter x-admin-token"
            />
          </div>
        </section>

        <CollapsibleSection
          icon={Wand2}
          title="Batch enrichment"
          description="Run the current Groq enrichment flow against a filtered slice of the lexicon."
          open={isBatchOpen}
          onOpenChange={setIsBatchOpen}
          triggerId="admin-enrichment-batch"
        >
          <form
            className="grid gap-4 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              batchMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="batch-limit">Word limit</Label>
              <Input
                id="batch-limit"
                type="number"
                min={1}
                max={200}
                value={String(limit)}
                onChange={(event) => {
                  const nextValue = Number.parseInt(event.target.value, 10);
                  if (Number.isFinite(nextValue)) {
                    setLimit(Math.max(1, Math.min(200, nextValue)));
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Mode</Label>
              <Select value={mode} onValueChange={(value) => setMode(value as EnrichmentMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {MODE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Part of speech</Label>
              <Select value={pos} onValueChange={(value) => setPos(value as Word['pos'] | 'ALL')}>
                <SelectTrigger>
                  <SelectValue placeholder="POS" />
                </SelectTrigger>
                <SelectContent>
                  {POS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
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

            <BooleanToggle
              label="Only incomplete entries"
              description="Restrict runs to words that are still missing required learning data."
              checked={onlyIncomplete}
              onCheckedChange={setOnlyIncomplete}
            />

            <BooleanToggle
              label="Allow overwrite"
              description="Permit AI updates to replace existing values instead of only filling blanks."
              checked={overwrite}
              onCheckedChange={setOverwrite}
            />

            <div className="lg:col-span-3 flex justify-end">
              <Button type="submit" disabled={batchMutation.isPending}>
                {batchMutation.isPending ? 'Running…' : 'Run enrichment'}
              </Button>
            </div>
          </form>

          {lastBatchResult ? (
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Scanned {lastBatchResult.scanned}</Badge>
                <Badge variant={lastBatchResult.updated > 0 ? 'default' : 'secondary'}>
                  Updated {lastBatchResult.updated}
                </Badge>
              </div>

              {lastBatchResult.words.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Word</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Updated fields</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lastBatchResult.words.map((word) => (
                      <TableRow key={word.id}>
                        <TableCell>
                          <div className="font-medium">{word.lemma}</div>
                          <div className="text-xs text-muted-foreground">{word.pos}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={word.updated ? 'default' : 'secondary'}>
                            {word.updated ? 'Updated' : 'No change'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {getFieldSummary(word.fields)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-sm text-muted-foreground">No candidate words matched this batch.</p>
              )}
            </div>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection
          icon={ListChecks}
          title="Incomplete queue"
          description="Review pending incomplete words and enrich them one by one when a full batch would be too broad."
          open={isQueueOpen}
          onOpenChange={setIsQueueOpen}
          triggerId="admin-enrichment-queue"
        >
          <div className="grid gap-4 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="queue-search">Search</Label>
              <Input
                id="queue-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by lemma or English"
              />
            </div>

            <div className="space-y-2">
              <Label>Part of speech</Label>
              <Select value={pos} onValueChange={(value) => setPos(value as Word['pos'] | 'ALL')}>
                <SelectTrigger>
                  <SelectValue placeholder="POS" />
                </SelectTrigger>
                <SelectContent>
                  {POS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
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
              <Label>Rows per page</Label>
              <Select
                value={String(perPage)}
                onValueChange={(value) => {
                  setPerPage(Number.parseInt(value, 10) || 25);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rows" />
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

          {isUnauthorized ? (
            <p className="text-sm text-destructive">
              Admin access is required. Provide a valid token or sign in with an admin account.
            </p>
          ) : null}

          {candidateQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading incomplete words…</p>
          ) : null}

          {candidateQuery.isError && !isUnauthorized ? (
            <p className="text-sm text-destructive">
              {candidateQuery.error instanceof Error ? candidateQuery.error.message : 'Failed to load words'}
            </p>
          ) : null}

          {!candidateQuery.isLoading && !candidateQuery.isError && words.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending incomplete words match the current filters.
            </p>
          ) : null}

          {words.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Word</TableHead>
                  <TableHead>Missing fields</TableHead>
                  <TableHead>Enrichment</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {words.map((word) => {
                  const missingFields = getMissingFields(word);
                  const isEnriched = Boolean(word.enrichmentAppliedAt);
                  const isRowPending = enrichingWordId === word.id;

                  return (
                    <TableRow key={word.id}>
                      <TableCell className="space-y-1">
                        <div className="font-medium">{word.lemma}</div>
                        <div className="text-xs text-muted-foreground">
                          {word.pos} · Level {word.level ?? '—'} · English {word.english ?? '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {missingFields.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {missingFields.map((field) => (
                              <Badge key={field} variant="secondary">
                                {formatMissingField(field)}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">No missing fields</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isEnriched ? 'default' : 'secondary'}>
                          {isEnriched ? 'Previously enriched' : 'Not enriched yet'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={enrichMutation.isPending && isRowPending}
                          onClick={() =>
                            enrichMutation.mutate(
                              {
                                id: word.id,
                                overwrite,
                              },
                              {
                                onSuccess: () => {
                                  toast({ title: `Enriched ${word.lemma}` });
                                },
                              },
                            )
                          }
                        >
                          {enrichMutation.isPending && isRowPending ? 'Enriching…' : 'Enrich now'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}

          {pagination ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Page {pagination.page} of {Math.max(pagination.totalPages, 1)} · {pagination.total} words
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagination.totalPages === 0 || pagination.page >= pagination.totalPages}
                  onClick={() =>
                    setPage((currentPage) =>
                      pagination.totalPages > 0 ? Math.min(currentPage + 1, pagination.totalPages) : currentPage,
                    )
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CollapsibleSection>
      </div>
    </AppShell>
  );
}
