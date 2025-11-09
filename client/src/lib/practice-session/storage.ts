import { resolveLocalStorage } from '@/lib/storage';

import {
  createEmptySessionState,
  CURRENT_SESSION_STATE_VERSION,
  MAX_RECENT_HISTORY,
  type PracticeSessionState,
} from './state';

const STORAGE_KEY = 'practice.session';
const STORAGE_CONTEXT = 'practice session';
const PERSISTED_SESSION_VERSION = 1;
const DEFAULT_SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000;

interface PersistedPracticeSessionEnvelope {
  version: number;
  savedAt: string;
  scopeKey: string | null;
  userId: string | null;
  state: PracticeSessionState;
}

export interface LoadPracticeSessionOptions {
  scopeKey?: string | null;
  userId?: string | null;
  now?: Date;
  expiryMs?: number;
}

export interface SavePracticeSessionOptions {
  scopeKey?: string | null;
  userId?: string | null;
  now?: Date;
}

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

function normaliseScopeKey(scopeKey?: string | null): string | null {
  if (!scopeKey) {
    return null;
  }
  const trimmed = scopeKey.trim();
  if (!trimmed) {
    return null;
  }

  const sanitized = trimmed.replace(/[^0-9a-zA-Z_-]+/g, '-');
  const collapsedHyphen = sanitized.replace(/-{2,}/g, '-');
  const collapsedUnderscore = collapsedHyphen.replace(/_{2,}/g, '_');
  const normalized = collapsedUnderscore.replace(/^[-_]+|[-_]+$/g, '');

  return normalized.length ? normalized : null;
}

function resolveStorageKey(scopeKey?: string | null): string {
  const normalised = normaliseScopeKey(scopeKey);
  if (!normalised) {
    return STORAGE_KEY;
  }
  return `${STORAGE_KEY}.${normalised}`;
}

function parsePersistedSession(raw: string): PersistedPracticeSessionEnvelope | null {
  try {
    const parsed = JSON.parse(raw) as PersistedPracticeSessionEnvelope | PracticeSessionState | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if ('state' in parsed && typeof parsed.state === 'object') {
      return parsed as PersistedPracticeSessionEnvelope;
    }

    // Legacy format: plain session state without envelope metadata.
    if ('queue' in parsed) {
      return {
        version: 0,
        savedAt: '',
        scopeKey: null,
        userId: null,
        state: parsed as PracticeSessionState,
      } satisfies PersistedPracticeSessionEnvelope;
    }

    return null;
  } catch (error) {
    console.warn('Failed to parse practice session state, resetting', error);
    return null;
  }
}

function sanitiseLoadedState(state: PracticeSessionState): PracticeSessionState {
  const parsedRecent = Array.isArray(state.recent)
    ? state.recent.filter((value): value is string => typeof value === 'string')
    : [];
  const uniqueRecent = Array.from(new Set(parsedRecent));

  const baseState = {
    ...createEmptySessionState(),
    ...state,
    recent: uniqueRecent.slice(0, MAX_RECENT_HISTORY),
  } satisfies PracticeSessionState;

  if (baseState.version < 2) {
    baseState.version = 2;
    baseState.leitner = null;
    baseState.isReviewSession = false;
  }

  if (baseState.version < CURRENT_SESSION_STATE_VERSION) {
    baseState.version = CURRENT_SESSION_STATE_VERSION;
  }

  return baseState;
}

function shouldDiscardPersistedSession(
  envelope: PersistedPracticeSessionEnvelope,
  options: LoadPracticeSessionOptions,
): boolean {
  if (envelope.version !== PERSISTED_SESSION_VERSION) {
    return true;
  }

  const expectedScope = normaliseScopeKey(options.scopeKey ?? null);
  if (expectedScope && envelope.scopeKey !== expectedScope) {
    return true;
  }
  if (expectedScope === null && envelope.scopeKey) {
    return true;
  }

  if (typeof options.userId !== 'undefined') {
    const expectedUserId = options.userId ?? null;
    if ((envelope.userId ?? null) !== expectedUserId) {
      return true;
    }
  }

  const expiryMs = typeof options.expiryMs === 'number' ? options.expiryMs : DEFAULT_SESSION_EXPIRY_MS;
  const now = options.now?.getTime() ?? Date.now();
  const savedAt = Date.parse(envelope.savedAt);
  if (!Number.isFinite(savedAt) || now - savedAt > expiryMs) {
    return true;
  }

  return false;
}

export function loadPracticeSession(options: LoadPracticeSessionOptions = {}): PracticeSessionState {
  const storage = getStorage();
  if (!storage) {
    return createEmptySessionState();
  }

  const storageKey = resolveStorageKey(options.scopeKey);
  const raw = storage.getItem(storageKey);
  if (!raw) {
    return createEmptySessionState();
  }

  const parsed = parsePersistedSession(raw);
  if (!parsed) {
    storage.removeItem(storageKey);
    return createEmptySessionState();
  }

  if (parsed.version === 0) {
    // Legacy session without metadata should be discarded so we don't reuse stale tasks.
    storage.removeItem(storageKey);
    return createEmptySessionState();
  }

  if (shouldDiscardPersistedSession(parsed, options)) {
    storage.removeItem(storageKey);
    return createEmptySessionState();
  }

  return sanitiseLoadedState(parsed.state);
}

export function savePracticeSession(
  state: PracticeSessionState,
  options: SavePracticeSessionOptions = {},
): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const storageKey = resolveStorageKey(options.scopeKey);
  const envelope: PersistedPracticeSessionEnvelope = {
    version: PERSISTED_SESSION_VERSION,
    savedAt: (options.now ?? new Date()).toISOString(),
    scopeKey: normaliseScopeKey(options.scopeKey ?? null),
    userId: options.userId ?? null,
    state: { ...state, version: CURRENT_SESSION_STATE_VERSION },
  };

  try {
    storage.setItem(storageKey, JSON.stringify(envelope));
  } catch (error) {
    console.warn('Failed to persist practice session state', error);
  }
}

export function resetSession(options: { scopeKey?: string | null } = {}): PracticeSessionState {
  const state = createEmptySessionState();
  const storage = getStorage();
  if (storage) {
    storage.removeItem(resolveStorageKey(options.scopeKey));
  }
  return state;
}
