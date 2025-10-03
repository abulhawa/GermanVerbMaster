import type { PracticeSettingsRendererPreferences, PracticeSettingsState, TaskType } from '@shared';
import type { CEFRLevel, LexemePos } from '@shared';

const STORAGE_KEY = 'practice.settings';
const LEGACY_STORAGE_KEY = 'settings';
const MIGRATION_MARKER_KEY = 'practice.settings.migrated';

interface LegacySettings {
  level: CEFRLevel;
  showHints: boolean;
  showExamples: boolean;
}

const DEFAULT_RENDERER_PREFS: PracticeSettingsRendererPreferences = {
  showHints: true,
  showExamples: true,
};

export function createDefaultSettings(): PracticeSettingsState {
  const now = new Date().toISOString();
  return {
    version: 1,
    defaultTaskType: 'conjugate_form',
    preferredTaskTypes: ['conjugate_form'],
    cefrLevelByPos: { verb: 'A1' },
    rendererPreferences: {
      conjugate_form: { ...DEFAULT_RENDERER_PREFS },
      noun_case_declension: { ...DEFAULT_RENDERER_PREFS },
      adj_ending: { ...DEFAULT_RENDERER_PREFS },
    },
    legacyVerbLevel: 'A1',
    migratedFromLegacy: false,
    updatedAt: now,
  } satisfies PracticeSettingsState;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      return window.localStorage;
    }
    if (typeof globalThis.localStorage !== 'undefined') {
      return globalThis.localStorage;
    }
    return null;
  } catch (error) {
    console.warn('Local storage unavailable for practice settings:', error);
    return null;
  }
}

function parseLegacySettings(raw: string): LegacySettings | null {
  try {
    const parsed = JSON.parse(raw) as LegacySettings;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse legacy practice settings, ignoring', error);
    return null;
  }
}

function migrateLegacySettings(storage: Storage): PracticeSettingsState {
  const legacyRaw = storage.getItem(LEGACY_STORAGE_KEY);
  const legacy = legacyRaw ? parseLegacySettings(legacyRaw) : null;
  const defaults = createDefaultSettings();

  if (legacy) {
    defaults.cefrLevelByPos = { ...defaults.cefrLevelByPos, verb: legacy.level };
    defaults.legacyVerbLevel = legacy.level;
    defaults.rendererPreferences = {
      ...defaults.rendererPreferences,
      conjugate_form: {
        showHints: legacy.showHints,
        showExamples: legacy.showExamples,
      },
    };
    defaults.migratedFromLegacy = true;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(defaults));
  } catch (error) {
    console.warn('Failed to persist migrated practice settings', error);
  }

  storage.setItem(MIGRATION_MARKER_KEY, '1');
  storage.removeItem(LEGACY_STORAGE_KEY);
  return defaults;
}

function parseSettings(raw: string): PracticeSettingsState | null {
  try {
    const parsed = JSON.parse(raw) as PracticeSettingsState;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn('Failed to parse practice settings, resetting', error);
    return null;
  }
}

function ensureSettings(storage: Storage): PracticeSettingsState {
  const marker = storage.getItem(MIGRATION_MARKER_KEY);
  if (marker !== '1') {
    return migrateLegacySettings(storage);
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultSettings();
  }

  const parsed = parseSettings(raw);
  if (!parsed) {
    storage.removeItem(STORAGE_KEY);
    return createDefaultSettings();
  }
  return parsed;
}

export function loadPracticeSettings(): PracticeSettingsState {
  const storage = getStorage();
  if (!storage) {
    return createDefaultSettings();
  }

  return ensureSettings(storage);
}

export function savePracticeSettings(state: PracticeSettingsState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
    storage.setItem(MIGRATION_MARKER_KEY, '1');
  } catch (error) {
    console.warn('Failed to persist practice settings', error);
  }
}

export interface UpdateRendererPreferencesInput {
  taskType: TaskType;
  preferences: Partial<PracticeSettingsRendererPreferences>;
}

export interface UpdateCefrLevelInput {
  pos: LexemePos;
  level: CEFRLevel;
}

export function updateRendererPreferences(
  state: PracticeSettingsState,
  input: UpdateRendererPreferencesInput,
): PracticeSettingsState {
  const existing = state.rendererPreferences[input.taskType] ?? { ...DEFAULT_RENDERER_PREFS };
  return {
    ...state,
    rendererPreferences: {
      ...state.rendererPreferences,
      [input.taskType]: {
        ...existing,
        ...input.preferences,
      },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function updateCefrLevel(
  state: PracticeSettingsState,
  input: UpdateCefrLevelInput,
): PracticeSettingsState {
  return {
    ...state,
    cefrLevelByPos: {
      ...state.cefrLevelByPos,
      [input.pos]: input.level,
    },
    legacyVerbLevel: input.pos === 'verb' ? input.level : state.legacyVerbLevel,
    updatedAt: new Date().toISOString(),
  };
}

export function updatePreferredTaskTypes(
  state: PracticeSettingsState,
  taskTypes: TaskType[],
): PracticeSettingsState {
  const unique = Array.from(new Set(taskTypes));
  return {
    ...state,
    preferredTaskTypes: unique.length ? unique : state.preferredTaskTypes,
    defaultTaskType: unique[0] ?? state.defaultTaskType,
    updatedAt: new Date().toISOString(),
  };
}
