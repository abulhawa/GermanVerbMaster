import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, Undo2 } from 'lucide-react';

import { AppShell } from '@/components/layout/app-shell';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { wordsResponseSchema, wordSchema, type AdminWord } from './admin-word-schemas';
import { formatMissingField, getMissingFields } from './admin-enrichment-shared';

const PAGE_SIZE = 25;
const MAX_UNDO = 5;

const POS_FILTER_OPTIONS: Array<{ label: string; value: AdminWord['pos'] | 'ALL' }> = [
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

const LEVEL_FILTER_OPTIONS = ['All', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;

const POS_LABELS: Record<AdminWord['pos'], string> = {
  V: 'Verb',
  N: 'Noun',
  Adj: 'Adjective',
  Adv: 'Adverb',
  Pron: 'Pronoun',
  Det: 'Determiner',
  Präp: 'Preposition',
  Konj: 'Conjunction',
  Num: 'Number',
  Part: 'Particle',
  Interj: 'Interjection',
};

type LevelFilter = (typeof LEVEL_FILTER_OPTIONS)[number];
type PosFilter = AdminWord['pos'] | 'ALL';

type RequiredFieldKey =
  | 'english'
  | 'exampleDe'
  | 'exampleEn'
  | 'praeteritum'
  | 'partizipIi'
  | 'perfekt'
  | 'gender'
  | 'plural'
  | 'comparative'
  | 'superlative';

type UndoEntry = {
  wordId: number;
  lemma: string;
  previousApproved: boolean;
};

const BASE_REQUIRED_FIELDS: RequiredFieldKey[] = ['english', 'exampleDe', 'exampleEn'];

const REQUIRED_FIELDS_BY_POS: Partial<Record<AdminWord['pos'], RequiredFieldKey[]>> = {
  V: ['praeteritum', 'partizipIi', 'perfekt'],
  N: ['gender', 'plural'],
  Adj: ['comparative', 'superlative'],
};

function getRequiredFields(word: AdminWord): RequiredFieldKey[] {
  return [...BASE_REQUIRED_FIELDS, ...(REQUIRED_FIELDS_BY_POS[word.pos] ?? [])];
}

function formatFieldValue(word: AdminWord, field: RequiredFieldKey): string {
  const value = word[field];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : '—';
  }
  return value ? String(value) : '—';
}

const AdminQuickApprovalPage = () => {
  const [posFilter, setPosFilter] = useState<PosFilter>('ALL');
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('All');
  const [processedWordIds, setProcessedWordIds] = useState<number[]>([]);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  const navigationItems = useMemo(() => getPrimaryNavigationItems(), []);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    setProcessedWordIds([]);
    setUndoStack([]);
  }, [posFilter, levelFilter]);

  const queryKey = useMemo(() => ['quick-approval', posFilter, levelFilter], [posFilter, levelFilter]);

  const wordsQuery = useInfiniteQuery({
    queryKey,
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        admin: '1',
        approved: 'false',
        page: String(pageParam),
        perPage: String(PAGE_SIZE),
      });
      if (posFilter !== 'ALL') {
        params.set('pos', posFilter);
      }
      if (levelFilter !== 'All') {
        params.set('level', levelFilter);
      }

      const response = await fetch(`/api/words?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Failed to load words (${response.status})`);
      }

      const payload = await response.json();
      return wordsResponseSchema.parse(payload);
    },
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError, error } = wordsQuery;

  const allWords = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const completeWords = useMemo(() => allWords.filter((word) => word.complete), [allWords]);
  const processedSet = useMemo(() => new Set(processedWordIds), [processedWordIds]);
  const unprocessedWords = useMemo(
    () => completeWords.filter((word) => !processedSet.has(word.id)),
    [completeWords, processedSet],
  );
  const activeWord = unprocessedWords[0] ?? null;
  const remainingCount = unprocessedWords.length;

  useEffect(() => {
    if (!hasNextPage || isLoading || isFetchingNextPage) {
      return;
    }
    if (remainingCount <= 3) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, remainingCount]);

  const markWordProcessed = useCallback((wordId: number) => {
    setProcessedWordIds((prev) => (prev.includes(wordId) ? prev : [...prev, wordId]));
  }, []);

  const removeWordFromProcessed = useCallback((wordId: number) => {
    setProcessedWordIds((prev) => prev.filter((id) => id !== wordId));
  }, []);

  const approveMutation = useMutation({
    mutationFn: async (word: AdminWord) => {
      const response = await fetch(`/api/words/${word.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to approve word (${response.status})`);
      }

      const payload = await response.json();
      return wordSchema.parse(payload);
    },
    onSuccess: (_updatedWord, word) => {
      markWordProcessed(word.id);
      setUndoStack((prev) => {
        const nextEntry: UndoEntry = {
          wordId: word.id,
          lemma: word.lemma,
          previousApproved: word.approved,
        };
        return [nextEntry, ...prev].slice(0, MAX_UNDO);
      });
      queryClient.invalidateQueries({ queryKey });
      toast({ title: 'Word approved', description: `${word.lemma} is now approved.` });
    },
    onError: (mutationError) => {
      toast({
        title: 'Approval failed',
        description: mutationError instanceof Error ? mutationError.message : String(mutationError),
        variant: 'destructive',
      });
    },
  });

  const undoMutation = useMutation({
    mutationFn: async (entry: UndoEntry) => {
      const response = await fetch(`/api/words/${entry.wordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: entry.previousApproved }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Failed to undo approval (${response.status})`);
      }

      const payload = await response.json();
      return wordSchema.parse(payload);
    },
  });

  const isBusy = approveMutation.isPending || undoMutation.isPending;

  const handleApprove = useCallback(() => {
    if (!activeWord || isBusy) {
      return;
    }
    approveMutation.mutate(activeWord);
  }, [activeWord, approveMutation, isBusy]);

  const handleSkip = useCallback(() => {
    if (!activeWord || isBusy) {
      return;
    }
    markWordProcessed(activeWord.id);
  }, [activeWord, isBusy, markWordProcessed]);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || isBusy) {
      return;
    }

    const [entry, ...rest] = undoStack;
    undoMutation.mutate(entry, {
      onSuccess: () => {
        setUndoStack(rest);
        removeWordFromProcessed(entry.wordId);
        queryClient.invalidateQueries({ queryKey });
        toast({ title: 'Approval undone', description: `${entry.lemma} returned to pending.` });
      },
      onError: (mutationError) => {
        toast({
          title: 'Undo failed',
          description: mutationError instanceof Error ? mutationError.message : String(mutationError),
          variant: 'destructive',
        });
      },
    });
  }, [isBusy, queryClient, queryKey, removeWordFromProcessed, toast, undoMutation, undoStack]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!activeWord || isBusy) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      if (activeElement) {
        const tagName = activeElement.tagName;
        const role = activeElement.getAttribute('role');
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || activeElement.isContentEditable) {
          return;
        }
        if (role === 'combobox' || role === 'listbox' || role === 'menuitem') {
          return;
        }
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleApprove();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleSkip();
      }
    };

    window.addEventListener('keydown', listener);
    return () => {
      window.removeEventListener('keydown', listener);
    };
  }, [activeWord, handleApprove, handleSkip, isBusy]);

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

  const renderWordCard = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center gap-3 rounded-3xl border border-border/60 bg-card/80 p-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading pending words…
        </div>
      );
    }

    if (isError) {
      const message = error instanceof Error ? error.message : 'Failed to load words';
      return (
        <div className="rounded-3xl border border-destructive/40 bg-destructive/10 p-8 text-center text-sm text-destructive">
          {message}
        </div>
      );
    }

    if (!activeWord) {
      return (
        <div className="rounded-3xl border border-border/60 bg-card/80 p-8 text-center text-sm text-muted-foreground">
          No complete pending words match these filters. Try undoing an approval or widening the
          filters.
        </div>
      );
    }

    const requiredFields = getRequiredFields(activeWord);
    const missingFields = new Set(getMissingFields(activeWord));

    return (
      <div className="flex flex-col gap-6 rounded-[32px] border border-border/60 bg-card/90 p-8 shadow-soft">
        <div className="flex flex-col items-center gap-2 text-center">
          <Badge variant="secondary" className="rounded-full px-3 py-1 text-xs uppercase tracking-wide">
            {POS_LABELS[activeWord.pos]}
          </Badge>
          <h2 className="text-4xl font-semibold text-foreground">{activeWord.lemma}</h2>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="rounded-full px-3 py-1">
              Level {activeWord.level ?? '—'}
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {Math.max(remainingCount - 1, 0)} more in queue
            </Badge>
          </div>
          <p className="text-[13px] text-muted-foreground">← Skip &nbsp;•&nbsp; → Approve</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {requiredFields.map((field) => {
            const value = formatFieldValue(activeWord, field);
            const isMissing = missingFields.has(field);
            return (
              <div
                key={field}
                className={cn(
                  'flex flex-col gap-2 rounded-2xl border border-border/60 bg-background/40 p-4 text-left',
                  isMissing ? 'border-destructive/60 ring-1 ring-destructive/30' : '',
                )}
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {formatMissingField(field)}
                </span>
                <span className={cn('text-base text-foreground', isMissing ? 'font-semibold text-destructive' : 'font-medium')}>
                  {value}
                </span>
              </div>
            );
          })}
        </div>

        {missingFields.size > 0 ? (
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            {[...missingFields].map((field) => (
              <Badge key={field} variant="destructive" className="rounded-full px-3 py-1">
                Missing {formatMissingField(field)}
              </Badge>
            ))}
          </div>
        ) : null}

        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleSkip}
            disabled={isBusy}
            className="h-14 w-32 rounded-full text-base"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Button>
          <Button
            type="button"
            size="lg"
            onClick={handleApprove}
            disabled={isBusy}
            className="h-16 w-40 rounded-full text-base"
          >
            Approve <ArrowRight className="h-5 w-5" aria-hidden />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <AppShell sidebar={sidebar} mobileNav={<MobileNavBar items={navigationItems} />}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-border/60 bg-card/80 p-4 shadow-soft">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={posFilter} onValueChange={(value) => setPosFilter(value as PosFilter)}>
              <SelectTrigger
                aria-label="Filter by part of speech"
                className="w-[160px] justify-between rounded-full border-border/60 bg-background/60 text-sm"
              >
                <SelectValue placeholder="POS" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {POS_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={levelFilter} onValueChange={(value) => setLevelFilter(value as LevelFilter)}>
              <SelectTrigger
                aria-label="Filter by CEFR level"
                className="w-[140px] justify-between rounded-full border-border/60 bg-background/60 text-sm"
              >
                <SelectValue placeholder="Level" />
              </SelectTrigger>
              <SelectContent>
                {LEVEL_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            variant="ghost"
            onClick={handleUndo}
            disabled={undoStack.length === 0 || isBusy}
            className="gap-2 rounded-full border border-border/60 bg-background/40 px-4 py-2 text-sm"
          >
            <Undo2 className="h-4 w-4" aria-hidden /> Undo ({undoStack.length}/{MAX_UNDO})
          </Button>
        </div>

        <div className="flex justify-center">
          <div className="w-full max-w-3xl">{renderWordCard()}</div>
        </div>
      </div>
    </AppShell>
  );
};

export default AdminQuickApprovalPage;
