import { resolveLocalStorage } from '@/lib/storage';
import type { PracticeSettingsRendererPreferences, PracticeSettingsState, TaskType } from '@shared';
import type { CEFRLevel, LexemePos } from '@shared';

const STORAGE_KEY = 'practice.settings';
const LEGACY_STORAGE_KEY = 'settings';
const MIGRATION_MARKER_KEY = 'practice.settings.migrated';
const STORAGE_CONTEXT = 'practice settings';

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

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

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

export interface SavePracticeSettingsOptions {
  preserveUpdatedAt?: boolean;
}

export function savePracticeSettings(
  state: PracticeSettingsState,
  options: SavePracticeSettingsOptions = {},
): PracticeSettingsState {
  const storage = getStorage();
  if (!storage) {
    const resolvedState: PracticeSettingsState = {
      ...state,
      updatedAt: options.preserveUpdatedAt && state.updatedAt ? state.updatedAt : new Date().toISOString(),
    };
    return resolvedState;
  }

  try {
    const nextState: PracticeSettingsState = {
      ...state,
      updatedAt: options.preserveUpdatedAt && state.updatedAt ? state.updatedAt : new Date().toISOString(),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    storage.setItem(MIGRATION_MARKER_KEY, '1');
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('practice-settings:updated', {
          detail: { state: nextState },
        }),
      );
    }
    return nextState;
  } catch (error) {
    console.warn('Failed to persist practice settings', error);
    return {
      ...state,
      updatedAt: options.preserveUpdatedAt && state.updatedAt ? state.updatedAt : new Date().toISOString(),
    } satisfies PracticeSettingsState;
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
