import { useCallback, useEffect, useMemo, useRef } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { FirebaseError } from "firebase/app";

import { useAuth } from "@/contexts/auth-context";
import { getFirebaseFirestore } from "@/lib/firebase";
import { loadPracticeSettings, savePracticeSettings } from "@/lib/practice-settings";
import { loadPracticeProgress, savePracticeProgress } from "@/lib/practice-progress";
import {
  getAnswerHistoryUpdatedAt,
  loadAnswerHistory,
  saveAnswerHistory,
  type TaskAnswerHistoryItem,
} from "@/lib/answer-history";
import {
  applyThemeSetting,
  getInitialThemeSetting,
  getThemeUpdatedAt,
  persistThemeSetting,
  type ThemeSetting,
} from "@/lib/theme";
import type { PracticeProgressState, PracticeSettingsState } from "@shared";

interface PendingWriteSettings {
  type: "settings";
  payload: PracticeSettingsState;
  updatedAt: string;
}

interface PendingWriteProgress {
  type: "progress";
  payload: PracticeProgressState;
  updatedAt: string;
}

interface PendingWriteAnswers {
  type: "answers";
  payload: TaskAnswerHistoryItem[];
  updatedAt: string;
}

interface PendingWriteTheme {
  type: "theme";
  payload: ThemeSetting;
  updatedAt: string;
}

type PendingWrite = PendingWriteSettings | PendingWriteProgress | PendingWriteAnswers | PendingWriteTheme;

const QUEUE_STORAGE_PREFIX = "cloud.sync.queue";

const toTimestamp = (value?: string | null) => {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const createQueueKey = (uid: string) => `${QUEUE_STORAGE_PREFIX}.${uid}`;

const loadQueue = (uid: string): PendingWrite[] => {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(createQueueKey(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingWrite[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.warn("[cloud-sync] Failed to load pending queue", error);
    return [];
  }
};

const saveQueue = (uid: string, queue: PendingWrite[]) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!queue.length) {
      window.localStorage.removeItem(createQueueKey(uid));
      return;
    }
    window.localStorage.setItem(createQueueKey(uid), JSON.stringify(queue));
  } catch (error) {
    console.warn("[cloud-sync] Failed to persist pending queue", error);
  }
};

export function useCloudSync() {
  const { status, profile } = useAuth();
  const firestore = useMemo(() => getFirebaseFirestore(), []);
  const queueRef = useRef<PendingWrite[]>([]);
  const flushingRef = useRef(false);
  const suppressRef = useRef({
    settings: false,
    progress: false,
    answers: false,
    theme: false,
  });
  const lastUidRef = useRef<string | null>(null);

  const queueWrite = useCallback(
    (write: PendingWrite) => {
      if (!profile) return;
      queueRef.current = queueRef.current.filter((item) => item.type !== write.type);
      queueRef.current.push(write);
      saveQueue(profile.uid, queueRef.current);
    },
    [profile],
  );

  const flushQueue = useCallback(async () => {
    if (!profile || status !== "authenticated") {
      return;
    }

    if (flushingRef.current || queueRef.current.length === 0) {
      return;
    }

    flushingRef.current = true;
    try {
      while (queueRef.current.length) {
        const write = queueRef.current[queueRef.current.length - 1];
        try {
          const baseRef = doc(firestore, "users", profile.uid);
          switch (write.type) {
            case "settings": {
              const settingsRef = doc(baseRef, "preferences", "practiceSettings");
              await setDoc(
                settingsRef,
                {
                  state: write.payload,
                  updatedAt: write.updatedAt,
                  updatedAtServer: serverTimestamp(),
                },
                { merge: true },
              );
              break;
            }
            case "progress": {
              const progressRef = doc(baseRef, "progress", "summary");
              await setDoc(
                progressRef,
                {
                  state: write.payload,
                  updatedAt: write.updatedAt,
                  updatedAtServer: serverTimestamp(),
                },
                { merge: true },
              );
              break;
            }
            case "answers": {
              const answersRef = doc(baseRef, "history", "answers");
              await setDoc(
                answersRef,
                {
                  history: write.payload,
                  updatedAt: write.updatedAt,
                  updatedAtServer: serverTimestamp(),
                },
                { merge: true },
              );
              break;
            }
            case "theme": {
              const themeRef = doc(baseRef, "preferences", "ui");
              await setDoc(
                themeRef,
                {
                  theme: write.payload,
                  updatedAt: write.updatedAt,
                  updatedAtServer: serverTimestamp(),
                },
                { merge: true },
              );
              break;
            }
          }

          await setDoc(baseRef, { lastSyncedAt: serverTimestamp() }, { merge: true });
          queueRef.current.pop();
          saveQueue(profile.uid, queueRef.current);
        } catch (error) {
          const isRetryable =
            error instanceof FirebaseError &&
            ["unavailable", "deadline-exceeded", "internal", "aborted"].includes(error.code);
          if (!isRetryable) {
            console.error("[cloud-sync] Unable to flush write", error);
            queueRef.current.pop();
            saveQueue(profile.uid, queueRef.current);
            continue;
          }
          break;
        }
      }
    } finally {
      flushingRef.current = false;
    }
  }, [firestore, profile, status]);

  const applyRemoteSettings = useCallback(
    (state: PracticeSettingsState) => {
      if (!profile) return;
      suppressRef.current.settings = true;
      savePracticeSettings(state, { preserveUpdatedAt: true });
      queueRef.current = queueRef.current.filter((item) => item.type !== "settings");
      saveQueue(profile.uid, queueRef.current);
      setTimeout(() => {
        suppressRef.current.settings = false;
      }, 0);
    },
    [profile],
  );

  const applyRemoteProgress = useCallback(
    (state: PracticeProgressState) => {
      if (!profile) return;
      suppressRef.current.progress = true;
      savePracticeProgress(state, { preserveUpdatedAt: true });
      queueRef.current = queueRef.current.filter((item) => item.type !== "progress");
      saveQueue(profile.uid, queueRef.current);
      setTimeout(() => {
        suppressRef.current.progress = false;
      }, 0);
    },
    [profile],
  );

  const applyRemoteAnswers = useCallback(
    (history: TaskAnswerHistoryItem[], updatedAt: string) => {
      if (!profile) return;
      suppressRef.current.answers = true;
      saveAnswerHistory(history);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("practice.answerHistory.updatedAt", updatedAt);
      }
      queueRef.current = queueRef.current.filter((item) => item.type !== "answers");
      saveQueue(profile.uid, queueRef.current);
      setTimeout(() => {
        suppressRef.current.answers = false;
      }, 0);
    },
    [profile],
  );

  const applyRemoteTheme = useCallback(
    (theme: ThemeSetting, updatedAt: string) => {
      if (!profile) return;
      suppressRef.current.theme = true;
      persistThemeSetting(theme, { updatedAt, emitEvent: false });
      applyThemeSetting(theme);
      queueRef.current = queueRef.current.filter((item) => item.type !== "theme");
      saveQueue(profile.uid, queueRef.current);
      setTimeout(() => {
        suppressRef.current.theme = false;
      }, 0);
    },
    [profile],
  );

  useEffect(() => {
    if (status !== "authenticated" || !profile) {
      if (lastUidRef.current) {
        saveQueue(lastUidRef.current, []);
      }
      queueRef.current = [];
      return;
    }

    queueRef.current = loadQueue(profile.uid);
    lastUidRef.current = profile.uid;

    const runInitialSync = async () => {
      try {
        const baseRef = doc(firestore, "users", profile.uid);
        const [settingsSnap, progressSnap, answersSnap, themeSnap] = await Promise.all([
          getDoc(doc(baseRef, "preferences", "practiceSettings")),
          getDoc(doc(baseRef, "progress", "summary")),
          getDoc(doc(baseRef, "history", "answers")),
          getDoc(doc(baseRef, "preferences", "ui")),
        ]);

        const localSettings = loadPracticeSettings();
        const remoteSettingsData = settingsSnap.data() as
          | { state?: PracticeSettingsState; updatedAt?: string }
          | undefined;
        const remoteSettings = remoteSettingsData?.state;
        const remoteSettingsUpdatedAt = remoteSettingsData?.updatedAt ?? remoteSettings?.updatedAt;
        if (remoteSettings && remoteSettingsUpdatedAt) {
          remoteSettings.updatedAt = remoteSettingsUpdatedAt;
        }

        if (remoteSettings && toTimestamp(remoteSettings.updatedAt) > toTimestamp(localSettings.updatedAt)) {
          applyRemoteSettings(remoteSettings);
        } else {
          const updatedAt = localSettings.updatedAt ?? new Date().toISOString();
          queueWrite({ type: "settings", payload: localSettings, updatedAt });
        }

        const localProgress = loadPracticeProgress();
        const remoteProgressData = progressSnap.data() as
          | { state?: PracticeProgressState; updatedAt?: string }
          | undefined;
        const remoteProgress = remoteProgressData?.state;
        const remoteProgressUpdatedAt = remoteProgressData?.updatedAt ?? remoteProgress?.updatedAt;
        if (remoteProgress && remoteProgressUpdatedAt) {
          remoteProgress.updatedAt = remoteProgressUpdatedAt;
        }

        if (remoteProgress && toTimestamp(remoteProgress.updatedAt) > toTimestamp(localProgress.updatedAt)) {
          applyRemoteProgress(remoteProgress);
        } else {
          const updatedAt = localProgress.updatedAt ?? new Date().toISOString();
          queueWrite({ type: "progress", payload: localProgress, updatedAt });
        }

        const localAnswers = loadAnswerHistory();
        const localAnswersUpdatedAt = getAnswerHistoryUpdatedAt();
        const remoteAnswersData = answersSnap.data() as
          | { history?: TaskAnswerHistoryItem[]; updatedAt?: string }
          | undefined;
        const remoteAnswers = remoteAnswersData?.history ?? [];
        const remoteAnswersUpdatedAt = remoteAnswersData?.updatedAt;

        if (
          remoteAnswersUpdatedAt &&
          toTimestamp(remoteAnswersUpdatedAt) > toTimestamp(localAnswersUpdatedAt)
        ) {
          applyRemoteAnswers(remoteAnswers, remoteAnswersUpdatedAt);
        } else {
          const updatedAt = localAnswersUpdatedAt ?? new Date().toISOString();
          queueWrite({ type: "answers", payload: localAnswers, updatedAt });
        }

        const localTheme = getInitialThemeSetting();
        const localThemeUpdatedAt = getThemeUpdatedAt();
        const remoteThemeData = themeSnap.data() as { theme?: ThemeSetting; updatedAt?: string } | undefined;
        const remoteTheme = remoteThemeData?.theme;
        const remoteThemeUpdatedAt = remoteThemeData?.updatedAt;

        if (
          remoteTheme &&
          remoteThemeUpdatedAt &&
          toTimestamp(remoteThemeUpdatedAt) > toTimestamp(localThemeUpdatedAt)
        ) {
          applyRemoteTheme(remoteTheme, remoteThemeUpdatedAt);
        } else if (localTheme) {
          const updatedAt = localThemeUpdatedAt ?? new Date().toISOString();
          queueWrite({ type: "theme", payload: localTheme, updatedAt });
        }
      } finally {
        void flushQueue();
      }
    };

    void runInitialSync();
  }, [applyRemoteAnswers, applyRemoteProgress, applyRemoteSettings, applyRemoteTheme, firestore, flushQueue, profile, queueWrite, status]);

  useEffect(() => {
    if (status !== "authenticated" || !profile) {
      return;
    }

    const handleSettings = (event: PracticeSettingsUpdatedEvent) => {
      if (suppressRef.current.settings) {
        suppressRef.current.settings = false;
        return;
      }
      const updatedAt = event.detail.state.updatedAt ?? new Date().toISOString();
      queueWrite({ type: "settings", payload: event.detail.state, updatedAt });
      void flushQueue();
    };

    const handleProgress = (event: PracticeProgressUpdatedEvent) => {
      if (suppressRef.current.progress) {
        suppressRef.current.progress = false;
        return;
      }
      const updatedAt = event.detail.state.updatedAt ?? new Date().toISOString();
      queueWrite({ type: "progress", payload: event.detail.state, updatedAt });
      void flushQueue();
    };

    const handleAnswers = (event: AnswerHistoryUpdatedEvent) => {
      if (suppressRef.current.answers) {
        suppressRef.current.answers = false;
        return;
      }
      queueWrite({ type: "answers", payload: event.detail.history, updatedAt: event.detail.updatedAt });
      void flushQueue();
    };

    const handleTheme = (event: ThemePreferenceUpdatedEvent) => {
      if (suppressRef.current.theme) {
        suppressRef.current.theme = false;
        return;
      }
      queueWrite({ type: "theme", payload: event.detail.theme, updatedAt: event.detail.updatedAt });
      void flushQueue();
    };

    const handleOnline = () => {
      void flushQueue();
    };

    window.addEventListener("practice-settings:updated", handleSettings);
    window.addEventListener("practice-progress:updated", handleProgress);
    window.addEventListener("answer-history:updated", handleAnswers);
    window.addEventListener("theme-preference:updated", handleTheme);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("practice-settings:updated", handleSettings);
      window.removeEventListener("practice-progress:updated", handleProgress);
      window.removeEventListener("answer-history:updated", handleAnswers);
      window.removeEventListener("theme-preference:updated", handleTheme);
      window.removeEventListener("online", handleOnline);
    };
  }, [flushQueue, profile, queueWrite, status]);
}
