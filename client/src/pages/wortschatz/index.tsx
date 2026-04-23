import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, Filter, RotateCcw, Sparkles, Volume2, XCircle } from 'lucide-react';

import { useAuthSession } from '@/auth/session';
import { AppShell } from '@/components/layout/app-shell';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTranslations } from '@/locales';
import { speak } from '@/lib/utils';
import { fetchWortschatzWords, WORTSCHATZ_QUERY_KEY } from '@/lib/wortschatz';
import {
  ALL_WORTSCHATZ_POS,
  loadWortschatzState,
  saveWortschatzState,
  type WortschatzStorageState,
} from '@/lib/wortschatz-storage';
import type { PartOfSpeech, WortschatzWord } from '@shared';

const WORTSCHATZ_IDS = {
  page: 'wortschatz-page',
  header: 'wortschatz-header',
  tabs: 'wortschatz-tabs',
  search: 'wortschatz-search',
  filters: 'wortschatz-filters',
  drillCard: 'wortschatz-drill-card',
  listSection: 'wortschatz-list-section',
} as const;

function arraysEqual<T>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

function wordMatchesSearch(word: WortschatzWord, searchQuery: string): boolean {
  if (!searchQuery) {
    return true;
  }

  const haystack = [
    word.lemma,
    word.english,
    word.exampleDe,
    word.exampleEn,
    word.gender,
    word.plural,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();

  return haystack.includes(searchQuery);
}

function buildFilterSignature(searchQuery: string, selectedPos: PartOfSpeech[]): string {
  return `${searchQuery}__${[...selectedPos].sort().join(',')}`;
}

function createDrillSeed(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createShuffledOrder(words: WortschatzWord[], seed: string): number[] {
  const shuffled = [...words];
  let state = hashSeed(seed) || 1;

  const nextRandom = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  return shuffled.map((word) => word.id);
}

function resetDrillState(
  state: WortschatzStorageState,
  words: WortschatzWord[],
  options: {
    datasetVersion: string;
    filterSignature: string;
    preserveMastery: boolean;
  },
): WortschatzStorageState {
  const drillSeed = words.length > 0 ? createDrillSeed() : null;

  return {
    ...state,
    drillSeed,
    drillOrder: drillSeed ? createShuffledOrder(words, drillSeed) : [],
    drillIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    masteredWordIds: options.preserveMastery ? state.masteredWordIds : [],
    datasetVersion: options.datasetVersion,
    filterSignature: options.filterSignature,
  };
}

function formatWordHeading(word: WortschatzWord): string {
  if (word.pos === 'N' && word.gender) {
    return `${word.gender} ${word.lemma}`;
  }

  return word.lemma;
}

function groupWordsByPos(words: WortschatzWord[]) {
  const grouped = new Map<PartOfSpeech, WortschatzWord[]>();

  for (const word of words) {
    const existing = grouped.get(word.pos) ?? [];
    existing.push(word);
    grouped.set(word.pos, existing);
  }

  return grouped;
}

export default function WortschatzPage() {
  const authSession = useAuthSession();
  const translations = useTranslations();
  const copy = translations.wortschatz;
  const isMobile = useIsMobile();
  const navigationItems = getPrimaryNavigationItems(authSession.data?.user.role ?? null);
  const [storageState, setStorageState] = useState(() => loadWortschatzState());
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);

  const wortschatzQuery = useQuery({
    queryKey: WORTSCHATZ_QUERY_KEY,
    queryFn: fetchWortschatzWords,
  });

  const words = wortschatzQuery.data?.words ?? [];
  const datasetVersion = wortschatzQuery.data?.datasetVersion ?? null;
  const availablePos = ALL_WORTSCHATZ_POS.filter((pos) => words.some((word) => word.pos === pos));
  const selectedPos = storageState.selectedPos.filter((pos) => availablePos.includes(pos));
  const effectiveSelectedPos = selectedPos.length > 0 ? selectedPos : availablePos;
  const normalizedSearchQuery = normalizeSearchQuery(storageState.searchQuery);
  const filteredWords = words.filter(
    (word) =>
      (effectiveSelectedPos.length === 0 || effectiveSelectedPos.includes(word.pos)) &&
      wordMatchesSearch(word, normalizedSearchQuery),
  );
  const filterSignature = buildFilterSignature(normalizedSearchQuery, effectiveSelectedPos);
  const wordsById = new Map(words.map((word) => [word.id, word] as const));
  const groupedWords = groupWordsByPos(filteredWords);
  const masteredWordIds = new Set(storageState.masteredWordIds);
  const masteredVisibleCount = filteredWords.filter((word) => masteredWordIds.has(word.id)).length;
  const masteredProgress =
    filteredWords.length > 0 ? Math.round((masteredVisibleCount / filteredWords.length) * 100) : 0;
  const totalAttempts = storageState.correctCount + storageState.wrongCount;
  const accuracy = totalAttempts > 0 ? Math.round((storageState.correctCount / totalAttempts) * 100) : null;
  const currentWordId = storageState.drillOrder[storageState.drillIndex] ?? null;
  const currentWord = currentWordId ? wordsById.get(currentWordId) ?? null : null;
  const isDrillComplete = filteredWords.length > 0 && storageState.drillIndex >= storageState.drillOrder.length;
  const remainingCount = currentWord ? Math.max(storageState.drillOrder.length - storageState.drillIndex - 1, 0) : 0;

  useEffect(() => {
    saveWortschatzState(storageState);
  }, [storageState]);

  useEffect(() => {
    if (!datasetVersion) {
      return;
    }

    setStorageState((previous) => {
      let next = previous;

      const nextSelectedPos = previous.selectedPos.filter((pos) => availablePos.includes(pos));
      const resolvedSelectedPos = nextSelectedPos.length > 0 ? nextSelectedPos : availablePos;
      if (!arraysEqual(previous.selectedPos, resolvedSelectedPos)) {
        next = {
          ...next,
          selectedPos: resolvedSelectedPos,
        };
      }

      const validWordIds = new Set(words.map((word) => word.id));
      const prunedMastery = next.masteredWordIds.filter((id) => validWordIds.has(id));
      if (!arraysEqual(next.masteredWordIds, prunedMastery)) {
        next = {
          ...next,
          masteredWordIds: prunedMastery,
        };
      }

      const datasetChanged = next.datasetVersion !== datasetVersion;
      const filtersChanged = next.filterSignature !== filterSignature;

      if (datasetChanged) {
        return resetDrillState(next, filteredWords, {
          datasetVersion,
          filterSignature,
          preserveMastery: false,
        });
      }

      if (filtersChanged) {
        return resetDrillState(next, filteredWords, {
          datasetVersion,
          filterSignature,
          preserveMastery: true,
        });
      }

      const visibleIds = new Set(filteredWords.map((word) => word.id));
      const nextDrillOrder = next.drillOrder.filter((id) => visibleIds.has(id));
      const orderedIds = new Set(nextDrillOrder);
      const missingVisibleWord = filteredWords.some((word) => !orderedIds.has(word.id));

      if (
        filteredWords.length > 0 &&
        (!next.drillSeed || missingVisibleWord || nextDrillOrder.length !== filteredWords.length)
      ) {
        return resetDrillState(next, filteredWords, {
          datasetVersion,
          filterSignature,
          preserveMastery: true,
        });
      }

      if (!arraysEqual(next.drillOrder, nextDrillOrder)) {
        next = {
          ...next,
          drillOrder: nextDrillOrder,
        };
      }

      const clampedIndex = Math.min(next.drillIndex, next.drillOrder.length);
      if (clampedIndex !== next.drillIndex) {
        next = {
          ...next,
          drillIndex: clampedIndex,
        };
      }

      return next;
    });
  }, [availablePos, datasetVersion, filterSignature, filteredWords, words]);

  useEffect(() => {
    setIsAnswerVisible(false);
  }, [currentWordId, storageState.activeTab]);

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

  const filterPanel = (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{copy.filters.title}</p>
        <p className="text-xs text-muted-foreground">{copy.filters.description}</p>
      </div>
      <div className="space-y-2">
        {availablePos.map((pos) => {
          const checkboxId = `wortschatz-pos-${pos}`;
          const checked = effectiveSelectedPos.includes(pos);
          return (
            <div
              key={pos}
              className="flex items-center gap-3 rounded-2xl border border-border/60 bg-muted/30 px-3 py-2"
            >
              <Checkbox
                id={checkboxId}
                checked={checked}
                onCheckedChange={(value) => {
                  const shouldCheck = Boolean(value);
                  setStorageState((previous) => {
                    const currentSelection = previous.selectedPos.filter((item) => availablePos.includes(item));
                    const baseSelection = currentSelection.length > 0 ? currentSelection : availablePos;

                    if (!shouldCheck && baseSelection.length <= 1 && baseSelection.includes(pos)) {
                      return previous;
                    }

                    const nextSelection = shouldCheck
                      ? Array.from(new Set([...baseSelection, pos]))
                      : baseSelection.filter((item) => item !== pos);

                    return {
                      ...previous,
                      selectedPos: nextSelection,
                    };
                  });
                }}
                aria-label={copy.posLabels[pos]}
              />
              <Label htmlFor={checkboxId} className="text-sm text-foreground">
                {copy.posLabels[pos]}
              </Label>
            </div>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full rounded-2xl"
        onClick={() =>
          setStorageState((previous) => ({
            ...previous,
            selectedPos: [...availablePos],
          }))
        }
      >
        {copy.filters.reset}
      </Button>
    </div>
  );

  const filterControl = isMobile ? (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="rounded-2xl"
          aria-label={copy.filters.label}
          id={WORTSCHATZ_IDS.filters}
        >
          <Filter className="h-4 w-4" aria-hidden />
          {copy.filters.label}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-[28px]">
        <SheetHeader>
          <SheetTitle>{copy.filters.title}</SheetTitle>
          <SheetDescription>{copy.filters.description}</SheetDescription>
        </SheetHeader>
        <div className="mt-6">{filterPanel}</div>
      </SheetContent>
    </Sheet>
  ) : (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="rounded-2xl"
          aria-label={copy.filters.label}
          id={WORTSCHATZ_IDS.filters}
        >
          <Filter className="h-4 w-4" aria-hidden />
          {copy.filters.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={12}
        className="w-[320px] rounded-3xl border border-border/60 bg-card p-5 shadow-xl"
      >
        {filterPanel}
      </PopoverContent>
    </Popover>
  );

  const handleRestartDrill = () => {
    setStorageState((previous) =>
      resetDrillState(previous, filteredWords, {
        datasetVersion: datasetVersion ?? previous.datasetVersion ?? '',
        filterSignature,
        preserveMastery: true,
      }),
    );
    setIsAnswerVisible(false);
  };

  const handleDrillResult = (result: 'correct' | 'incorrect') => {
    if (!currentWord) {
      return;
    }

    setStorageState((previous) => {
      const nextMastery =
        result === 'correct' && !previous.masteredWordIds.includes(currentWord.id)
          ? [...previous.masteredWordIds, currentWord.id]
          : previous.masteredWordIds;

      return {
        ...previous,
        correctCount: previous.correctCount + (result === 'correct' ? 1 : 0),
        wrongCount: previous.wrongCount + (result === 'incorrect' ? 1 : 0),
        masteredWordIds: nextMastery,
        drillIndex: Math.min(previous.drillIndex + 1, previous.drillOrder.length),
      };
    });
  };

  return (
    <div id={WORTSCHATZ_IDS.page}>
      <AppShell sidebar={sidebar} mobileNav={<MobileNavBar items={navigationItems} />}>
        <div className="space-y-6">
          <section
            className="space-y-4 rounded-3xl border border-border/60 bg-card/85 p-6 shadow-soft shadow-primary/5"
            id={WORTSCHATZ_IDS.header}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {copy.datasetBadge}
                  </Badge>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {copy.kicker}
                  </p>
                </div>
                <div className="space-y-1">
                  <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground">
                    <BookOpen className="h-6 w-6 text-primary" aria-hidden />
                    Wortschatz
                  </h1>
                  <p className="max-w-3xl text-sm text-muted-foreground">{copy.pageDescription}</p>
                </div>
              </div>
              <div className="grid min-w-[240px] gap-2 rounded-3xl border border-border/60 bg-background/80 p-4 sm:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {copy.metrics.mastered}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {masteredVisibleCount}/{filteredWords.length}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {copy.metrics.accuracy}
                  </p>
                  <p className="text-lg font-semibold text-foreground">
                    {accuracy === null ? '–' : `${accuracy}%`}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {copy.metrics.remaining}
                  </p>
                  <p className="text-lg font-semibold text-foreground">{currentWord ? remainingCount : 0}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Label htmlFor={WORTSCHATZ_IDS.search} className="sr-only">
                    {copy.search.label}
                  </Label>
                  <Input
                    id={WORTSCHATZ_IDS.search}
                    value={storageState.searchQuery}
                    onChange={(event) =>
                      setStorageState((previous) => ({
                        ...previous,
                        searchQuery: event.target.value,
                      }))
                    }
                    placeholder={copy.search.placeholder}
                  />
                </div>
                <div>{filterControl}</div>
              </div>
              <div className="min-w-[220px]">
                <Progress value={masteredProgress} aria-label={copy.metrics.progressLabel} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {copy.metrics.progressDetail
                    .replace('{count}', String(masteredVisibleCount))
                    .replace('{total}', String(filteredWords.length))}
                </p>
              </div>
            </div>
          </section>

          <Tabs
            value={storageState.activeTab}
            onValueChange={(value) =>
              setStorageState((previous) => ({
                ...previous,
                activeTab: value === 'list' ? 'list' : 'drill',
              }))
            }
            id={WORTSCHATZ_IDS.tabs}
          >
            <TabsList className="h-auto rounded-3xl bg-muted/60 p-1.5">
              <TabsTrigger className="rounded-2xl px-5 py-2.5" value="drill">
                {copy.tabs.drill}
              </TabsTrigger>
              <TabsTrigger className="rounded-2xl px-5 py-2.5" value="list">
                {copy.tabs.list}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="drill" className="space-y-6">
              {wortschatzQuery.isLoading ? (
                <Card className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
                  <CardHeader>
                    <Skeleton className="h-6 w-44" />
                    <Skeleton className="h-4 w-72" />
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Skeleton className="h-36 w-full rounded-3xl" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Skeleton className="h-11 w-full rounded-2xl" />
                      <Skeleton className="h-11 w-full rounded-2xl" />
                    </div>
                  </CardContent>
                </Card>
              ) : wortschatzQuery.error ? (
                <Card className="rounded-3xl border border-destructive/40 bg-card/85 shadow-soft shadow-primary/5">
                  <CardHeader>
                    <CardTitle>{copy.errors.loadTitle}</CardTitle>
                    <CardDescription>{copy.errors.loadDescription}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button type="button" className="rounded-2xl" onClick={() => void wortschatzQuery.refetch()}>
                      {copy.errors.retry}
                    </Button>
                  </CardContent>
                </Card>
              ) : filteredWords.length === 0 ? (
                <Card className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
                  <CardHeader>
                    <CardTitle>{copy.drill.emptyTitle}</CardTitle>
                    <CardDescription>{copy.drill.emptyDescription}</CardDescription>
                  </CardHeader>
                </Card>
              ) : isDrillComplete ? (
                <Card className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
                      <div>
                        <CardTitle>{copy.drill.completedTitle}</CardTitle>
                        <CardDescription>{copy.drill.completedDescription}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {copy.metrics.mastered}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-foreground">
                          {masteredVisibleCount}/{filteredWords.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {copy.metrics.accuracy}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-foreground">
                          {accuracy === null ? '–' : `${accuracy}%`}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          {copy.metrics.total}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{totalAttempts}</p>
                      </div>
                    </div>
                    <Button type="button" className="rounded-2xl" onClick={handleRestartDrill}>
                      <RotateCcw className="h-4 w-4" aria-hidden />
                      {copy.drill.restart}
                    </Button>
                  </CardContent>
                </Card>
              ) : currentWord ? (
                <Card
                  className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5"
                  id={WORTSCHATZ_IDS.drillCard}
                >
                  <CardHeader className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full px-3 py-1">
                            {copy.datasetBadge}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            {copy.posLabels[currentWord.pos]}
                          </Badge>
                        </div>
                        <CardTitle>{copy.drill.heading}</CardTitle>
                        <CardDescription>{copy.drill.description}</CardDescription>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => speak(formatWordHeading(currentWord))}
                        aria-label={`${copy.drill.pronunciationLabel} ${currentWord.lemma}`}
                      >
                        <Volume2 className="h-4 w-4" aria-hidden />
                        {copy.drill.pronunciationLabel}
                      </Button>
                    </div>
                    <Progress
                      value={
                        storageState.drillOrder.length > 0
                          ? Math.round((storageState.drillIndex / storageState.drillOrder.length) * 100)
                          : 0
                      }
                      aria-label={copy.drill.queueProgressLabel}
                    />
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="rounded-3xl border border-border/60 bg-background/80 p-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                        {isAnswerVisible ? copy.drill.backPrompt : copy.drill.frontPrompt}
                      </p>
                      <div className="mt-4 space-y-3">
                        <h2 className="text-3xl font-semibold text-foreground">{formatWordHeading(currentWord)}</h2>
                        {currentWord.plural ? (
                          <p className="text-sm text-muted-foreground">
                            {copy.list.pluralLabel}:{' '}
                            <span className="font-medium text-foreground">{currentWord.plural}</span>
                          </p>
                        ) : null}
                        {isAnswerVisible ? (
                          <div className="space-y-3 rounded-2xl border border-border/60 bg-card/70 p-4">
                            <p className="text-lg font-medium text-foreground">
                              {currentWord.english ?? copy.list.noTranslation}
                            </p>
                            {currentWord.exampleDe ? (
                              <div className="space-y-1 text-sm text-muted-foreground">
                                <p className="font-medium text-foreground">{currentWord.exampleDe}</p>
                                {currentWord.exampleEn ? <p>{currentWord.exampleEn}</p> : null}
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">{copy.list.noExample}</p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant={isAnswerVisible ? 'secondary' : 'default'}
                        className="min-w-[180px] rounded-2xl"
                        onClick={() => setIsAnswerVisible((previous) => !previous)}
                      >
                        <Sparkles className="h-4 w-4" aria-hidden />
                        {isAnswerVisible ? copy.drill.hideAnswer : copy.drill.showAnswer}
                      </Button>
                      {isAnswerVisible ? (
                        <>
                          <Button
                            type="button"
                            className="min-w-[160px] rounded-2xl"
                            onClick={() => handleDrillResult('correct')}
                          >
                            <CheckCircle2 className="h-4 w-4" aria-hidden />
                            {copy.drill.correct}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-w-[160px] rounded-2xl"
                            onClick={() => handleDrillResult('incorrect')}
                          >
                            <XCircle className="h-4 w-4" aria-hidden />
                            {copy.drill.incorrect}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            <TabsContent value="list" className="space-y-6">
              {wortschatzQuery.isLoading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Card key={index} className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
                      <CardHeader>
                        <Skeleton className="h-6 w-36" />
                        <Skeleton className="h-4 w-56" />
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Skeleton className="h-20 w-full rounded-2xl" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : wortschatzQuery.error ? (
                <Card className="rounded-3xl border border-destructive/40 bg-card/85 shadow-soft shadow-primary/5">
                  <CardHeader>
                    <CardTitle>{copy.errors.loadTitle}</CardTitle>
                    <CardDescription>{copy.errors.loadDescription}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button type="button" className="rounded-2xl" onClick={() => void wortschatzQuery.refetch()}>
                      {copy.errors.retry}
                    </Button>
                  </CardContent>
                </Card>
              ) : filteredWords.length === 0 ? (
                <Card className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
                  <CardHeader>
                    <CardTitle>{copy.list.emptyTitle}</CardTitle>
                    <CardDescription>{copy.list.emptyDescription}</CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                <div className="space-y-6" id={WORTSCHATZ_IDS.listSection}>
                  {availablePos
                    .filter((pos) => groupedWords.has(pos))
                    .map((pos) => {
                      const entries = groupedWords.get(pos) ?? [];
                      return (
                        <section key={pos} className="space-y-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <h2 className="text-lg font-semibold text-foreground">{copy.posLabels[pos]}</h2>
                              <p className="text-sm text-muted-foreground">
                                {copy.list.sectionCount.replace('{count}', String(entries.length))}
                              </p>
                            </div>
                            <Badge variant="outline" className="rounded-full px-3 py-1">
                              {entries.length}
                            </Badge>
                          </div>
                          <div className="grid gap-4">
                            {entries.map((word) => (
                              <Card
                                key={word.id}
                                className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5"
                              >
                                <CardHeader>
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="space-y-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="secondary" className="rounded-full px-3 py-1">
                                          {copy.datasetBadge}
                                        </Badge>
                                        <Badge variant="outline" className="rounded-full px-3 py-1">
                                          {copy.posLabels[word.pos]}
                                        </Badge>
                                      </div>
                                      <CardTitle>{formatWordHeading(word)}</CardTitle>
                                      <CardDescription>{word.english ?? copy.list.noTranslation}</CardDescription>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      className="rounded-2xl"
                                      onClick={() => speak(formatWordHeading(word))}
                                      aria-label={`${copy.list.pronunciationLabel} ${word.lemma}`}
                                    >
                                      <Volume2 className="h-4 w-4" aria-hidden />
                                      {copy.list.pronunciationLabel}
                                    </Button>
                                  </div>
                                </CardHeader>
                                <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                                  <div className="space-y-3 rounded-2xl border border-border/60 bg-background/80 p-4">
                                    {word.plural ? (
                                      <p className="text-sm text-muted-foreground">
                                        {copy.list.pluralLabel}:{' '}
                                        <span className="font-medium text-foreground">{word.plural}</span>
                                      </p>
                                    ) : null}
                                    <p className="text-sm text-muted-foreground">
                                      {copy.list.translationLabel}:{' '}
                                      <span className="font-medium text-foreground">
                                        {word.english ?? copy.list.noTranslation}
                                      </span>
                                    </p>
                                  </div>
                                  <div className="space-y-2 rounded-2xl border border-border/60 bg-background/80 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                                      {copy.list.exampleLabel}
                                    </p>
                                    {word.exampleDe ? (
                                      <div className="space-y-1 text-sm text-muted-foreground">
                                        <p className="font-medium text-foreground">{word.exampleDe}</p>
                                        {word.exampleEn ? <p>{word.exampleEn}</p> : null}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">{copy.list.noExample}</p>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </AppShell>
    </div>
  );
}
