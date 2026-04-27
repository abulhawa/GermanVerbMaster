import { useEffect, useMemo, useState } from 'react';
import type { PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, CheckCircle2, Filter, RotateCcw, Search, Volume2, X } from 'lucide-react';

import { useAuthSession } from '@/auth/session';
import { B2Countdown } from '@/components/b2-countdown';
import { AppShell } from '@/components/layout/app-shell';
import { MobileNavBar } from '@/components/layout/mobile-nav-bar';
import { getPrimaryNavigationItems } from '@/components/layout/navigation';
import { SidebarNavButton } from '@/components/layout/sidebar-nav-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { fetchWortschatzWords, WORTSCHATZ_QUERY_KEY } from '@/lib/wortschatz';
import {
  ALL_WORTSCHATZ_LEVELS,
  ALL_WORTSCHATZ_POS,
  DEFAULT_WORTSCHATZ_LEVELS,
  loadWortschatzState,
  saveWortschatzState,
  type WortschatzLevelFilter,
  type WortschatzStorageState,
} from '@/lib/wortschatz-storage';
import { cn, speak } from '@/lib/utils';
import type { PartOfSpeech, WortschatzWord } from '@shared';

const B2_EXAM_DATE = new Date(2026, 3, 30);
const SWIPE_THRESHOLD_PX = 80;

const WORTSCHATZ_IDS = {
  page: 'wortschatz-page',
  search: 'wortschatz-search',
  filters: 'wortschatz-filters',
  listSection: 'wortschatz-list-section',
  drillCard: 'wortschatz-drill-card',
} as const;

function arraysEqual<T>(left: T[], right: T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function normalizeSearchQuery(value: string): string {
  return value.trim().toLowerCase();
}

function formatTemplate(template: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, value),
    template,
  );
}

function wordMatchesSearch(word: WortschatzWord, searchQuery: string): boolean {
  if (!searchQuery) {
    return true;
  }

  return [word.lemma, word.english, word.exampleDe, word.exampleEn, word.gender, word.plural]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase()
    .includes(searchQuery);
}

function wordMatchesLevels(word: WortschatzWord, selectedLevels: WortschatzLevelFilter[]): boolean {
  if (selectedLevels.length === 0) {
    return true;
  }

  if (selectedLevels.includes('B2 Beruf')) {
    return word.level === 'B2' || word.level === null;
  }

  return selectedLevels.some((level) => word.level === level);
}

function buildFilterSignature(
  searchQuery: string,
  selectedLevels: WortschatzLevelFilter[],
  selectedPos: PartOfSpeech[],
): string {
  return `${searchQuery}__${[...selectedLevels].sort().join(',')}__${[...selectedPos].sort().join(',')}`;
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
  return word.pos === 'N' && word.gender ? `${word.gender} ${word.lemma}` : word.lemma;
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

function toggleListValue<T>(current: T[], value: T): T[] {
  return current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
}

export default function WortschatzPage() {
  const authSession = useAuthSession();
  const translations = useTranslations();
  const copy = translations.wortschatz;
  const isMobile = useIsMobile();
  const navigationItems = getPrimaryNavigationItems(authSession.data?.user.role ?? null);
  const [storageState, setStorageState] = useState(() => loadWortschatzState());
  const [isAnswerVisible, setIsAnswerVisible] = useState(false);
  const [pointerStartX, setPointerStartX] = useState<number | null>(null);
  const [swipeHint, setSwipeHint] = useState<'correct' | 'incorrect' | null>(null);

  const wortschatzQuery = useQuery({
    queryKey: WORTSCHATZ_QUERY_KEY,
    queryFn: fetchWortschatzWords,
  });

  const words = wortschatzQuery.data?.words ?? [];
  const datasetVersion = wortschatzQuery.data?.datasetVersion ?? null;
  const availablePos = ALL_WORTSCHATZ_POS.filter((pos) => words.some((word) => word.pos === pos));
  const selectedPos = storageState.selectedPos.filter((pos) => availablePos.includes(pos));
  const effectiveSelectedPos = selectedPos.length > 0 ? selectedPos : availablePos;
  const selectedLevels = storageState.selectedLevels;
  const normalizedSearchQuery = normalizeSearchQuery(storageState.searchQuery);
  const filteredWords = useMemo(
    () =>
      words.filter(
        (word) =>
          wordMatchesLevels(word, selectedLevels) &&
          (effectiveSelectedPos.length === 0 || effectiveSelectedPos.includes(word.pos)) &&
          wordMatchesSearch(word, normalizedSearchQuery),
      ),
    [effectiveSelectedPos, normalizedSearchQuery, selectedLevels, words],
  );
  const filterSignature = buildFilterSignature(normalizedSearchQuery, selectedLevels, effectiveSelectedPos);
  const wordsById = new Map(words.map((word) => [word.id, word] as const));
  const groupedWords = groupWordsByPos(filteredWords);
  const masteredWordIds = new Set(storageState.masteredWordIds);
  const masteredVisibleCount = filteredWords.filter((word) => masteredWordIds.has(word.id)).length;
  const masteredProgress =
    filteredWords.length > 0 ? Math.round((masteredVisibleCount / filteredWords.length) * 100) : 0;
  const currentWordId = storageState.drillOrder[storageState.drillIndex] ?? null;
  const currentWord = currentWordId ? wordsById.get(currentWordId) ?? null : null;
  const isDrillComplete = filteredWords.length > 0 && storageState.drillIndex >= storageState.drillOrder.length;
  const activeFilterCount = selectedLevels.length + (selectedPos.length === availablePos.length ? 0 : selectedPos.length);

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
        next = { ...next, selectedPos: resolvedSelectedPos };
      }

      const validWordIds = new Set(words.map((word) => word.id));
      const prunedMastery = next.masteredWordIds.filter((id) => validWordIds.has(id));
      if (!arraysEqual(next.masteredWordIds, prunedMastery)) {
        next = { ...next, masteredWordIds: prunedMastery };
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
        next = { ...next, drillOrder: nextDrillOrder };
      }

      const clampedIndex = Math.min(next.drillIndex, next.drillOrder.length);
      return clampedIndex === next.drillIndex ? next : { ...next, drillIndex: clampedIndex };
    });
  }, [availablePos, datasetVersion, filterSignature, filteredWords, words]);

  useEffect(() => {
    setIsAnswerVisible(false);
    setSwipeHint(null);
  }, [currentWordId, storageState.activeTab]);

  const sidebar = (
    <div className="flex h-full flex-col justify-between gap-8">
      <div className="grid gap-2">
        {navigationItems.map((item) => (
          <SidebarNavButton key={item.href} href={item.href} icon={item.icon} label={item.label} exact={item.exact} />
        ))}
      </div>
    </div>
  );

  const updateLevels = (level: WortschatzLevelFilter | 'all') => {
    setStorageState((previous) => ({
      ...previous,
      selectedLevels:
        level === 'all'
          ? []
          : toggleListValue(previous.selectedLevels, level).filter((item) => ALL_WORTSCHATZ_LEVELS.includes(item)),
    }));
  };

  const updatePos = (pos: PartOfSpeech | 'all') => {
    setStorageState((previous) => ({
      ...previous,
      selectedPos:
        pos === 'all'
          ? [...availablePos]
          : toggleListValue(previous.selectedPos.filter((item) => availablePos.includes(item)), pos),
    }));
  };

  const filterPanel = (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{copy.filters.levelTitle}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={selectedLevels.length === 0 ? 'default' : 'outline'}
            className="rounded-full"
            onClick={() => updateLevels('all')}
          >
            {copy.filters.all}
          </Button>
          {ALL_WORTSCHATZ_LEVELS.map((level) => (
            <Button
              key={level}
              type="button"
              size="sm"
              variant={selectedLevels.includes(level) ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => updateLevels(level)}
            >
              {copy.levelLabels[level]}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-foreground">{copy.filters.posTitle}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={selectedPos.length === availablePos.length ? 'default' : 'outline'}
            className="rounded-full"
            onClick={() => updatePos('all')}
          >
            {copy.filters.all}
          </Button>
          {availablePos.map((pos) => (
            <Button
              key={pos}
              type="button"
              size="sm"
              variant={effectiveSelectedPos.includes(pos) ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => updatePos(pos)}
            >
              {copy.posLabels[pos]}
            </Button>
          ))}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full rounded-2xl"
        onClick={() =>
          setStorageState((previous) => ({
            ...previous,
            selectedLevels: [...DEFAULT_WORTSCHATZ_LEVELS],
            selectedPos: [...availablePos],
          }))
        }
      >
        {copy.filters.reset}
      </Button>
    </div>
  );

  const filterButton = (
    <Button type="button" variant="outline" className="relative rounded-2xl" aria-label={copy.filters.label} id={WORTSCHATZ_IDS.filters}>
      <Filter className="h-4 w-4" aria-hidden />
      <span className="sr-only">{copy.filters.label}</span>
      {activeFilterCount > 0 ? (
        <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold text-primary-foreground">
          {activeFilterCount}
        </span>
      ) : null}
    </Button>
  );

  const filterControl = isMobile ? (
    <Sheet>
      <SheetTrigger asChild>{filterButton}</SheetTrigger>
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
      <PopoverTrigger asChild>{filterButton}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={12} className="w-[360px] rounded-3xl border border-border/60 bg-card p-5 shadow-xl">
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
    setSwipeHint(null);
  };

  const handleCardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isAnswerVisible) {
      setPointerStartX(event.clientX);
    }
  };

  const handleCardPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerStartX === null || !isAnswerVisible) {
      return;
    }

    const delta = event.clientX - pointerStartX;
    setSwipeHint(delta > SWIPE_THRESHOLD_PX ? 'correct' : delta < -SWIPE_THRESHOLD_PX ? 'incorrect' : null);
  };

  const handleCardPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerStartX === null || !isAnswerVisible) {
      setPointerStartX(null);
      return;
    }

    const delta = event.clientX - pointerStartX;
    setPointerStartX(null);

    if (delta > SWIPE_THRESHOLD_PX) {
      handleDrillResult('correct');
    } else if (delta < -SWIPE_THRESHOLD_PX) {
      handleDrillResult('incorrect');
    } else {
      setSwipeHint(null);
    }
  };

  const renderLoading = () => (
    <Card className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
      <CardHeader>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-72" />
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-11 w-full rounded-2xl" />
          <Skeleton className="h-11 w-full rounded-2xl" />
          <Skeleton className="h-11 w-full rounded-2xl" />
        </div>
      </CardContent>
    </Card>
  );

  const renderError = () => (
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
  );

  return (
    <div id={WORTSCHATZ_IDS.page}>
      <AppShell sidebar={sidebar} mobileNav={<MobileNavBar items={navigationItems} />}>
        <div className="space-y-5">
          <section className="space-y-4 rounded-3xl border border-border/60 bg-card/85 p-4 shadow-soft shadow-primary/5 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold text-foreground">Wortschatz</h1>
                <p className="text-sm text-muted-foreground">{copy.pageDescription}</p>
              </div>
              <B2Countdown examDate={B2_EXAM_DATE} isActive />
            </div>

            <Tabs
              value={storageState.activeTab}
              onValueChange={(value) =>
                setStorageState((previous) => ({ ...previous, activeTab: value === 'list' ? 'list' : 'drill' }))
              }
            >
              <TabsList className="grid h-auto w-full grid-cols-2 rounded-2xl bg-muted/60 p-1">
                <TabsTrigger className="rounded-xl py-2.5" value="drill">
                  {copy.tabs.drill}
                </TabsTrigger>
                <TabsTrigger className="rounded-xl py-2.5" value="list">
                  {copy.tabs.list}
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Label htmlFor={WORTSCHATZ_IDS.search} className="sr-only">
                    {copy.search.label}
                  </Label>
                  <Input
                    id={WORTSCHATZ_IDS.search}
                    value={storageState.searchQuery}
                    onChange={(event) =>
                      setStorageState((previous) => ({ ...previous, searchQuery: event.target.value }))
                    }
                    className="pl-9"
                    placeholder={copy.search.placeholder}
                  />
                </div>
                {filterControl}
              </div>

              <TabsContent value="drill" className="mt-5 space-y-4">
                {wortschatzQuery.isLoading ? renderLoading() : null}
                {wortschatzQuery.error ? renderError() : null}
                {!wortschatzQuery.isLoading && !wortschatzQuery.error && filteredWords.length === 0 ? (
                  <Card className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
                    <CardHeader>
                      <CardTitle>{copy.drill.emptyTitle}</CardTitle>
                      <CardDescription>{copy.drill.emptyDescription}</CardDescription>
                    </CardHeader>
                  </Card>
                ) : null}
                {!wortschatzQuery.isLoading && !wortschatzQuery.error && isDrillComplete ? (
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
                    <CardContent>
                      <Button type="button" className="rounded-2xl" onClick={handleRestartDrill}>
                        <RotateCcw className="h-4 w-4" aria-hidden />
                        {copy.drill.restart}
                      </Button>
                    </CardContent>
                  </Card>
                ) : null}
                {!wortschatzQuery.isLoading && !wortschatzQuery.error && currentWord && !isDrillComplete ? (
                  <section className="space-y-4" id={WORTSCHATZ_IDS.drillCard}>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-2xl border border-success-border/60 bg-success-muted/70 px-4 py-3">
                        <p className="text-xs font-semibold text-success-muted-foreground">{copy.drill.correct}</p>
                        <p className="text-lg font-semibold text-success-foreground">{storageState.correctCount}</p>
                      </div>
                      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3">
                        <p className="text-xs font-semibold text-destructive">{copy.drill.incorrect}</p>
                        <p className="text-lg font-semibold text-destructive">{storageState.wrongCount}</p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
                        <p className="text-xs font-semibold text-muted-foreground">{copy.metrics.mastered}</p>
                        <p className="text-lg font-semibold text-foreground">
                          {masteredVisibleCount}/{filteredWords.length} {copy.metrics.words}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Progress value={masteredProgress} aria-label={copy.metrics.progressLabel} />
                      <p className="text-xs text-muted-foreground">
                        {formatTemplate(copy.metrics.progressDetail, {
                          count: String(masteredVisibleCount),
                          total: String(filteredWords.length),
                        })}
                      </p>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'relative min-h-[340px] touch-pan-y overflow-hidden rounded-3xl border border-border/60 bg-card p-5 shadow-soft shadow-primary/5 transition-transform',
                        isAnswerVisible ? 'cursor-grab' : 'cursor-pointer',
                      )}
                      onClick={() => setIsAnswerVisible(true)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setIsAnswerVisible(true);
                        }
                      }}
                      onPointerDown={handleCardPointerDown}
                      onPointerMove={handleCardPointerMove}
                      onPointerUp={handleCardPointerUp}
                    >
                      {swipeHint ? (
                        <div
                          className={cn(
                            'absolute inset-0 z-indicator flex items-center justify-center text-lg font-semibold',
                            swipeHint === 'correct'
                              ? 'bg-success-muted/90 text-success-muted-foreground'
                              : 'bg-destructive/15 text-destructive',
                          )}
                        >
                          {swipeHint === 'correct' ? copy.drill.correct : copy.drill.incorrect}
                        </div>
                      ) : null}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary" className="rounded-full px-3 py-1">
                            {copy.datasetBadge}
                          </Badge>
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            {copy.posLabels[currentWord.pos]}
                          </Badge>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="rounded-full"
                          onClick={(event) => {
                            event.stopPropagation();
                            speak(formatWordHeading(currentWord));
                          }}
                          aria-label={`${copy.drill.pronunciationLabel} ${currentWord.lemma}`}
                        >
                          <Volume2 className="h-5 w-5" aria-hidden />
                        </Button>
                      </div>

                      <div className="flex min-h-[230px] flex-col items-center justify-center gap-4 text-center">
                        {!isAnswerVisible ? (
                          <>
                            <h2 className="text-4xl font-semibold text-foreground">{formatWordHeading(currentWord)}</h2>
                            <p className="text-sm text-muted-foreground">{copy.drill.tapToReveal}</p>
                          </>
                        ) : (
                          <>
                            <p className="text-2xl font-semibold text-foreground">
                              {currentWord.english ?? copy.list.noTranslation}
                            </p>
                            <div className="max-w-2xl space-y-2 text-sm">
                              {currentWord.exampleDe ? (
                                <div className="flex items-start justify-center gap-2">
                                  <p className="font-medium text-foreground">{currentWord.exampleDe}</p>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-full"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      speak(currentWord.exampleDe ?? '');
                                    }}
                                    aria-label={copy.list.examplePronunciationLabel}
                                  >
                                    <Volume2 className="h-4 w-4" aria-hidden />
                                  </Button>
                                </div>
                              ) : null}
                              {currentWord.exampleEn ? <p className="text-muted-foreground">{currentWord.exampleEn}</p> : null}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid min-h-[52px] gap-2 sm:grid-cols-3">
                      {isAnswerVisible ? (
                        <>
                          <Button type="button" variant="secondary" className="rounded-2xl" onClick={() => setIsAnswerVisible(false)}>
                            {copy.drill.backToQuestion}
                          </Button>
                          <Button type="button" variant="outline" className="rounded-2xl" onClick={() => handleDrillResult('incorrect')}>
                            <X className="h-4 w-4" aria-hidden />
                            {copy.drill.incorrect}
                          </Button>
                          <Button type="button" className="rounded-2xl" onClick={() => handleDrillResult('correct')}>
                            <Check className="h-4 w-4" aria-hidden />
                            {copy.drill.correct}
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </section>
                ) : null}
              </TabsContent>

              <TabsContent value="list" className="mt-5 space-y-5">
                {wortschatzQuery.isLoading ? renderLoading() : null}
                {wortschatzQuery.error ? renderError() : null}
                {!wortschatzQuery.isLoading && !wortschatzQuery.error && filteredWords.length === 0 ? (
                  <Card className="rounded-3xl border border-border/60 bg-card/80 shadow-soft shadow-primary/5">
                    <CardHeader>
                      <CardTitle>{copy.list.emptyTitle}</CardTitle>
                      <CardDescription>{copy.list.emptyDescription}</CardDescription>
                    </CardHeader>
                  </Card>
                ) : null}
                {!wortschatzQuery.isLoading && !wortschatzQuery.error && filteredWords.length > 0 ? (
                  <div className="space-y-5" id={WORTSCHATZ_IDS.listSection}>
                    {availablePos
                      .filter((pos) => groupedWords.has(pos))
                      .map((pos) => {
                        const entries = groupedWords.get(pos) ?? [];
                        return (
                          <section key={pos} className="space-y-2">
                            <div className="flex items-center justify-between gap-3 px-1">
                              <h2 className="text-base font-semibold text-foreground">{copy.posLabels[pos]}</h2>
                              <Badge variant="outline" className="rounded-full px-3 py-1">
                                {formatTemplate(copy.list.sectionCount, { count: String(entries.length) })}
                              </Badge>
                            </div>
                            <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80">
                              {entries.map((word) => (
                                <article
                                  key={word.id}
                                  className="grid gap-3 border-b border-border/60 p-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_minmax(180px,260px)]"
                                >
                                  <div className="min-w-0 space-y-2">
                                    <div className="flex items-start gap-2">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 shrink-0 rounded-full"
                                        onClick={() => speak(formatWordHeading(word))}
                                        aria-label={`${copy.list.pronunciationLabel} ${formatWordHeading(word)}`}
                                      >
                                        <Volume2 className="h-4 w-4" aria-hidden />
                                      </Button>
                                      <div className="min-w-0">
                                        <h3 className="text-base font-semibold text-foreground">{formatWordHeading(word)}</h3>
                                        {word.plural ? (
                                          <p className="text-xs text-muted-foreground">
                                            {copy.list.pluralLabel}: <span className="font-medium text-foreground">{word.plural}</span>
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                    {word.exampleDe ? (
                                      <div className="flex items-start gap-2 pl-11 text-sm">
                                        <div className="min-w-0">
                                          <p className="font-medium text-foreground">{word.exampleDe}</p>
                                          {word.exampleEn ? <p className="text-muted-foreground">{word.exampleEn}</p> : null}
                                        </div>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 shrink-0 rounded-full"
                                          onClick={() => speak(word.exampleDe ?? '')}
                                          aria-label={copy.list.examplePronunciationLabel}
                                        >
                                          <Volume2 className="h-4 w-4" aria-hidden />
                                        </Button>
                                      </div>
                                    ) : (
                                      <p className="pl-11 text-sm text-muted-foreground">{copy.list.noExample}</p>
                                    )}
                                  </div>
                                  <p className="self-start text-sm font-medium text-foreground md:text-right">
                                    {word.english ?? copy.list.noTranslation}
                                  </p>
                                </article>
                              ))}
                            </div>
                          </section>
                        );
                      })}
                  </div>
                ) : null}
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </AppShell>
    </div>
  );
}
