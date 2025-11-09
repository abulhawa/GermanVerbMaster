import { useCallback, useEffect, useMemo, useState } from "react";

import { clearPracticeHistory, fetchPracticeHistory } from "@/lib/api";
import { getDeviceId } from "@/lib/device";
import { AnsweredQuestion, loadAnswerHistory, saveAnswerHistory } from "@/lib/answer-history";
import { formatAverageDuration, mergeAnswerLists, DEFAULT_PAGE_SIZE, LEVEL_FILTERS, RESULT_FILTERS, type LevelFilter, type ResultFilter } from "../utils";

interface UseAnswerHistoryOptions {
  pageSize?: number;
}

interface UseAnswerHistoryResult {
  history: AnsweredQuestion[];
  filteredHistory: AnsweredQuestion[];
  paginatedHistory: AnsweredQuestion[];
  levelFilter: LevelFilter;
  setLevelFilter: (filter: LevelFilter) => void;
  resultFilter: ResultFilter;
  setResultFilter: (filter: ResultFilter) => void;
  resetFilters: () => void;
  activeFilters: string[];
  hasActiveFilters: boolean;
  totalAnswers: number;
  totalCorrect: number;
  totalIncorrect: number;
  accuracy: number;
  formattedAverageTime: string;
  showSkeletonStats: boolean;
  isLoading: boolean;
  isClearing: boolean;
  loadError: string | null;
  clearHistory: () => void;
  retryLoad: () => void;
  page: number;
  totalPages: number;
  canGoNextPage: boolean;
  canGoPreviousPage: boolean;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  setPage: (page: number) => void;
  levelOptions: LevelFilter[];
  resultOptions: ResultFilter[];
}

export function useAnswerHistory({ pageSize = DEFAULT_PAGE_SIZE }: UseAnswerHistoryOptions = {}): UseAnswerHistoryResult {
  const [history, setHistory] = useState<AnsweredQuestion[]>(() => loadAnswerHistory());
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [resultFilter, setResultFilter] = useState<ResultFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshRequest, setRefreshRequest] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    saveAnswerHistory(history);
  }, [history]);

  useEffect(() => {
    let cancelled = false;
    const deviceId = getDeviceId();

    const refreshHistory = async () => {
      setIsLoading(true);
      setLoadError(null);

      try {
        const remoteHistory = await fetchPracticeHistory({ deviceId, limit: 150 });
        if (cancelled) {
          return;
        }

        setHistory((current) => mergeAnswerLists(remoteHistory, current));
      } catch (error) {
        if (!cancelled) {
          console.error("[answers] Failed to load practice history", error);
          const message = error instanceof Error && error.message
            ? error.message
            : "Failed to load answer history";
          setLoadError(message);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void refreshHistory();

    return () => {
      cancelled = true;
    };
  }, [refreshRequest]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesLevel =
        levelFilter === "all" || item.level === levelFilter || item.cefrLevel === levelFilter;
      const matchesResult = resultFilter === "all" || item.result === resultFilter;
      return matchesLevel && matchesResult;
    });
  }, [history, levelFilter, resultFilter]);

  const totalAnswers = history.length;
  const totalCorrect = useMemo(
    () => history.filter((item) => item.result === "correct").length,
    [history],
  );
  const totalIncorrect = totalAnswers - totalCorrect;
  const accuracy = totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;
  const totalTimeMs = useMemo(
    () => history.reduce((sum, item) => sum + (typeof item.timeSpent === "number" ? item.timeSpent : item.timeSpentMs ?? 0), 0),
    [history],
  );
  const averageTimeMs = totalAnswers > 0 ? Math.round(totalTimeMs / totalAnswers) : 0;
  const formattedAverageTime = formatAverageDuration(averageTimeMs);
  const showSkeletonStats = isLoading && history.length === 0;

  const activeFilters = useMemo(() => {
    const filters: string[] = [];
    if (levelFilter !== "all") {
      filters.push(`Level ${levelFilter}`);
    }
    if (resultFilter !== "all") {
      filters.push(resultFilter === "correct" ? "Correct answers" : "Incorrect answers");
    }
    return filters;
  }, [levelFilter, resultFilter]);
  const hasActiveFilters = activeFilters.length > 0;

  useEffect(() => {
    setPage(1);
  }, [levelFilter, resultFilter]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  }, [filteredHistory.length, pageSize]);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const paginatedHistory = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredHistory.slice(start, start + pageSize);
  }, [filteredHistory, page, pageSize]);

  const resetFilters = useCallback(() => {
    setLevelFilter("all");
    setResultFilter("all");
  }, []);

  const clearHistory = useCallback(() => {
    if (isClearing) {
      return;
    }

    setIsClearing(true);
    setLoadError(null);
    const deviceId = getDeviceId();

    void clearPracticeHistory({ deviceId })
      .then(() => {
        setHistory([]);
        setPage(1);
      })
      .catch((error) => {
        console.error("[answers] Failed to clear history", error);
        const message = error instanceof Error && error.message
          ? error.message
          : "Failed to clear answer history";
        setLoadError(message);
      })
      .finally(() => {
        setIsClearing(false);
      });
  }, [isClearing]);

  const retryLoad = useCallback(() => {
    if (isLoading) {
      return;
    }

    setRefreshRequest((value) => value + 1);
  }, [isLoading]);

  const goToNextPage = useCallback(() => {
    setPage((current) => Math.min(current + 1, totalPages));
  }, [totalPages]);

  const goToPreviousPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const canGoNextPage = page < totalPages;
  const canGoPreviousPage = page > 1;

  return {
    history,
    filteredHistory,
    paginatedHistory,
    levelFilter,
    setLevelFilter,
    resultFilter,
    setResultFilter,
    resetFilters,
    activeFilters,
    hasActiveFilters,
    totalAnswers,
    totalCorrect,
    totalIncorrect,
    accuracy,
    formattedAverageTime,
    showSkeletonStats,
    isLoading,
    isClearing,
    loadError,
    clearHistory,
    retryLoad,
    page,
    totalPages,
    canGoNextPage,
    canGoPreviousPage,
    goToNextPage,
    goToPreviousPage,
    setPage,
    levelOptions: LEVEL_FILTERS,
    resultOptions: RESULT_FILTERS,
  };
}
