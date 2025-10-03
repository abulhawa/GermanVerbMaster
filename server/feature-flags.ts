import type { LexemePos } from '@shared/task-registry';

import { parseBooleanFlag } from './config';

type FeatureFlagStage = 'ga' | 'beta';

interface PosFlagDefinition {
  readonly stage: FeatureFlagStage;
  readonly envVar?: string;
  readonly defaultValue: boolean;
  readonly description: string;
}

interface FeatureFlagEvent {
  readonly pos: LexemePos;
  readonly allowed: boolean;
  readonly context: string;
  readonly snapshot: FeatureFlagSnapshot;
  readonly timestamp: Date;
  readonly details?: Record<string, unknown>;
}

const POS_FLAG_DEFINITIONS: Record<LexemePos, PosFlagDefinition> = {
  verb: {
    stage: 'ga',
    defaultValue: true,
    description: 'Legacy verb training remains always-on.',
  },
  noun: {
    stage: 'beta',
    envVar: 'ENABLE_NOUNS_BETA',
    defaultValue: false,
    description: 'Gates noun declension tasks behind a beta flag.',
  },
  adjective: {
    stage: 'beta',
    envVar: 'ENABLE_ADJECTIVES_BETA',
    defaultValue: false,
    description: 'Gates adjective ending tasks behind a beta flag.',
  },
};

export interface PosFeatureFlagState {
  readonly stage: FeatureFlagStage;
  readonly enabled: boolean;
  readonly flag?: string;
  readonly defaultValue: boolean;
  readonly description: string;
}

export interface FeatureFlagSnapshot {
  readonly fetchedAt: Date;
  readonly pos: Record<LexemePos, PosFeatureFlagState>;
}

type FeatureFlagListener = (event: FeatureFlagEvent) => void;

const listeners = new Set<FeatureFlagListener>();

export function asLexemePos(value: string): LexemePos | null {
  switch (value) {
    case 'verb':
    case 'noun':
    case 'adjective':
      return value;
    default:
      return null;
  }
}

function computePosFlagState(pos: LexemePos): PosFeatureFlagState {
  const definition = POS_FLAG_DEFINITIONS[pos];
  if (!definition.envVar) {
    return {
      stage: definition.stage,
      enabled: definition.defaultValue,
      defaultValue: definition.defaultValue,
      description: definition.description,
    } satisfies PosFeatureFlagState;
  }

  const envValue = process.env[definition.envVar];
  const enabled = parseBooleanFlag(envValue, definition.defaultValue);
  return {
    stage: definition.stage,
    enabled,
    flag: definition.envVar,
    defaultValue: definition.defaultValue,
    description: definition.description,
  } satisfies PosFeatureFlagState;
}

export function getFeatureFlagSnapshot(): FeatureFlagSnapshot {
  const fetchedAt = new Date();
  const pos = {
    verb: computePosFlagState('verb'),
    noun: computePosFlagState('noun'),
    adjective: computePosFlagState('adjective'),
  } as const satisfies Record<LexemePos, PosFeatureFlagState>;

  return { fetchedAt, pos } satisfies FeatureFlagSnapshot;
}

export function isPosFeatureEnabled(
  pos: LexemePos,
  snapshot: FeatureFlagSnapshot = getFeatureFlagSnapshot(),
): boolean {
  return snapshot.pos[pos]?.enabled ?? false;
}

export class PosFeatureDisabledError extends Error {
  constructor(
    readonly pos: LexemePos,
    readonly context: string,
    readonly snapshot: FeatureFlagSnapshot,
  ) {
    super(`Tasks for part of speech "${pos}" are currently disabled`);
    this.name = 'PosFeatureDisabledError';
  }
}

function emitFeatureFlagEvent(event: FeatureFlagEvent): void {
  if (event.allowed) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error('[feature-flags] listener error', error);
    }
  }
}

export function ensurePosFeatureEnabled(
  pos: LexemePos,
  context: string,
  snapshot: FeatureFlagSnapshot = getFeatureFlagSnapshot(),
  details?: Record<string, unknown>,
): void {
  const allowed = isPosFeatureEnabled(pos, snapshot);
  if (!allowed) {
    emitFeatureFlagEvent({
      pos,
      allowed,
      context,
      snapshot,
      details,
      timestamp: new Date(),
    });
    throw new PosFeatureDisabledError(pos, context, snapshot);
  }
}

export function notifyPosFeatureBlocked(
  pos: LexemePos,
  context: string,
  snapshot: FeatureFlagSnapshot,
  details?: Record<string, unknown>,
): void {
  emitFeatureFlagEvent({
    pos,
    allowed: false,
    context,
    snapshot,
    details,
    timestamp: new Date(),
  });
}

export function onFeatureFlagEvent(listener: FeatureFlagListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function formatFeatureFlagHeader(snapshot: FeatureFlagSnapshot): string {
  return (
    Object.entries(snapshot.pos)
      .map(([key, state]) => `pos:${key}=${state.enabled ? '1' : '0'}`)
      .join(',')
  );
}

function createSnapshotSummary(snapshot: FeatureFlagSnapshot): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(snapshot.pos).map(([key, state]) => [
      key,
      {
        enabled: state.enabled,
        stage: state.stage,
        flag: state.flag ?? null,
        defaultValue: state.defaultValue,
      },
    ]),
  );
}

const loggedContexts = new Set<string>();

onFeatureFlagEvent((event) => {
  const contextKey = `${event.pos}:${event.context}`;
  const message = `[feature-flags] Blocked ${event.context} for disabled ${event.pos} tasks`;
  const payload = {
    details: event.details ?? null,
    snapshot: createSnapshotSummary(event.snapshot),
    timestamp: event.timestamp.toISOString(),
  };

  if (loggedContexts.has(contextKey)) {
    console.debug(message, payload);
  } else {
    console.warn(message, payload);
    loggedContexts.add(contextKey);
  }
});

