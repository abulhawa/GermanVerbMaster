import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { PracticeSettingsState } from '@shared';

import { loadPracticeSettings, savePracticeSettings } from '@/lib/practice-settings';

type PracticeSettingsUpdater =
  | PracticeSettingsState
  | ((previous: PracticeSettingsState) => PracticeSettingsState);

interface PracticeSettingsContextValue {
  settings: PracticeSettingsState;
  updateSettings: (updater: PracticeSettingsUpdater) => void;
}

const PracticeSettingsContext = createContext<PracticeSettingsContextValue | null>(null);

export function PracticeSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PracticeSettingsState>(() => loadPracticeSettings());

  const updateSettings = useCallback((updater: PracticeSettingsUpdater) => {
    setSettings((previous) => {
      const next =
        typeof updater === 'function'
          ? (updater as (prev: PracticeSettingsState) => PracticeSettingsState)(previous)
          : updater;

      if (Object.is(next, previous)) {
        return previous;
      }

      savePracticeSettings(next);
      return next;
    });
  }, []);

  const value = useMemo<PracticeSettingsContextValue>(
    () => ({
      settings,
      updateSettings,
    }),
    [settings, updateSettings],
  );

  return <PracticeSettingsContext.Provider value={value}>{children}</PracticeSettingsContext.Provider>;
}

export function usePracticeSettings(): PracticeSettingsContextValue {
  const context = useContext(PracticeSettingsContext);

  if (!context) {
    throw new Error('usePracticeSettings must be used within a PracticeSettingsProvider');
  }

  return context;
}
