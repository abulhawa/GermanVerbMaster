import type { PartOfSpeech } from '@shared';

import { resolveLocalStorage } from '@/lib/storage';

const STORAGE_KEY = 'wortschatz.state';
const STORAGE_CONTEXT = 'wortschatz';

export type WortschatzTab = 'drill' | 'list';

export const ALL_WORTSCHATZ_POS: PartOfSpeech[] = [
  'N',
  'V',
  'Adj',
  'Adv',
  'Pron',
  'Det',
  'Präp',
  'Konj',
  'Num',
  'Part',
  'Interj',
];

export interface WortschatzStorageState {
  activeTab: WortschatzTab;
  searchQuery: string;
  selectedPos: PartOfSpeech[];
  drillSeed: string | null;
  drillOrder: number[];
  drillIndex: number;
  correctCount: number;
  wrongCount: number;
  masteredWordIds: number[];
  datasetVersion: string | null;
  filterSignature: string;
}

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

function isPartOfSpeech(value: unknown): value is PartOfSpeech {
  return typeof value === 'string' && ALL_WORTSCHATZ_POS.includes(value as PartOfSpeech);
}

function sanitizeSelectedPos(value: unknown): PartOfSpeech[] {
  if (!Array.isArray(value)) {
    return [...ALL_WORTSCHATZ_POS];
  }

  const seen = new Set<PartOfSpeech>();
  const selected: PartOfSpeech[] = [];
  for (const item of value) {
    if (!isPartOfSpeech(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    selected.push(item);
  }

  return selected.length > 0 ? selected : [...ALL_WORTSCHATZ_POS];
}

function sanitizeNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<number>();
  const numbers: number[] = [];
  for (const item of value) {
    if (!Number.isInteger(item) || seen.has(item)) {
      continue;
    }
    seen.add(item);
    numbers.push(item);
  }

  return numbers;
}

export function createEmptyWortschatzState(): WortschatzStorageState {
  return {
    activeTab: 'drill',
    searchQuery: '',
    selectedPos: [...ALL_WORTSCHATZ_POS],
    drillSeed: null,
    drillOrder: [],
    drillIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    masteredWordIds: [],
    datasetVersion: null,
    filterSignature: '',
  };
}

function parseStoredState(raw: string): WortschatzStorageState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WortschatzStorageState> | null;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      activeTab: parsed.activeTab === 'list' ? 'list' : 'drill',
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : '',
      selectedPos: sanitizeSelectedPos(parsed.selectedPos),
      drillSeed:
        typeof parsed.drillSeed === 'string' && parsed.drillSeed.trim().length > 0
          ? parsed.drillSeed
          : null,
      drillOrder: sanitizeNumberList(parsed.drillOrder),
      drillIndex:
        typeof parsed.drillIndex === 'number' && Number.isInteger(parsed.drillIndex) && parsed.drillIndex >= 0
          ? parsed.drillIndex
          : 0,
      correctCount:
        typeof parsed.correctCount === 'number' && Number.isInteger(parsed.correctCount) && parsed.correctCount >= 0
          ? parsed.correctCount
          : 0,
      wrongCount:
        typeof parsed.wrongCount === 'number' && Number.isInteger(parsed.wrongCount) && parsed.wrongCount >= 0
          ? parsed.wrongCount
          : 0,
      masteredWordIds: sanitizeNumberList(parsed.masteredWordIds),
      datasetVersion: typeof parsed.datasetVersion === 'string' ? parsed.datasetVersion : null,
      filterSignature: typeof parsed.filterSignature === 'string' ? parsed.filterSignature : '',
    } satisfies WortschatzStorageState;
  } catch (error) {
    console.warn('Failed to parse stored Wortschatz state, resetting', error);
    return null;
  }
}

export function loadWortschatzState(): WortschatzStorageState {
  const storage = getStorage();
  if (!storage) {
    return createEmptyWortschatzState();
  }

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    return createEmptyWortschatzState();
  }

  const parsed = parseStoredState(raw);
  if (!parsed) {
    storage.removeItem(STORAGE_KEY);
    return createEmptyWortschatzState();
  }

  return parsed;
}

export function saveWortschatzState(state: WortschatzStorageState): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist Wortschatz state', error);
  }
}
