import { resolveLocalStorage } from '@/lib/storage';
import type { PracticeTaskQueueItem } from '@shared';

export interface InstalledPack {
  id: string;
  slug: string;
  name: string;
  installedAt: string;
  version?: string | number | null;
}

const STORAGE_KEY = 'practice.packs.installed';
const MIGRATION_MARKER_KEY = 'practice.packs.migrated';
const STORAGE_CONTEXT = 'practice packs';

const getStorage = () => resolveLocalStorage({ context: STORAGE_CONTEXT });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normaliseInstalledAt(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toISOString();
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  return new Date().toISOString();
}

function sanitisePackSnapshot(raw: unknown): InstalledPack | null {
  if (!isRecord(raw)) {
    return null;
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const slug = typeof raw.slug === 'string' ? raw.slug.trim() : '';
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';

  if (!id || !slug) {
    return null;
  }

  const installedAt = normaliseInstalledAt(raw.installedAt);
  const version = 'version' in raw ? (raw.version as InstalledPack['version']) ?? null : null;

  return {
    id,
    slug,
    name: name || slug,
    installedAt,
    version,
  } satisfies InstalledPack;
}

function parseInstalledPacks(raw: string | null): InstalledPack[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => sanitisePackSnapshot(item))
        .filter((item): item is InstalledPack => item !== null);
    }
  } catch (error) {
    console.warn('Failed to parse installed pack list, resetting', error);
  }
  return [];
}

function storeInstalledPacks(storage: Storage, packs: InstalledPack[]): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(packs));
    storage.setItem(MIGRATION_MARKER_KEY, '1');
  } catch (error) {
    console.warn('Failed to persist installed packs', error);
  }
}

export function loadInstalledPacks(): InstalledPack[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const packs = parseInstalledPacks(storage.getItem(STORAGE_KEY));
  if (!storage.getItem(MIGRATION_MARKER_KEY)) {
    storage.setItem(MIGRATION_MARKER_KEY, '1');
  }
  return packs;
}

export function saveInstalledPacks(packs: InstalledPack[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  const sanitised = packs
    .map((pack) => sanitisePackSnapshot(pack))
    .filter((pack): pack is InstalledPack => pack !== null);
  storeInstalledPacks(storage, sanitised);
}

export function mergeInstalledPacks(
  existing: InstalledPack[],
  incoming: InstalledPack[],
): InstalledPack[] {
  const merged = new Map<string, InstalledPack>();
  for (const pack of existing) {
    merged.set(pack.id, pack);
  }
  for (const pack of incoming) {
    const sanitised = sanitisePackSnapshot(pack);
    if (sanitised) {
      merged.set(sanitised.id, sanitised);
    }
  }
  return Array.from(merged.values()).sort((a, b) => a.slug.localeCompare(b.slug));
}

export function recordInstalledPacks(packs: InstalledPack[]): InstalledPack[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }

  const existing = loadInstalledPacks();
  const merged = mergeInstalledPacks(existing, packs);
  storeInstalledPacks(storage, merged);
  return merged;
}

export function extractPacksFromQueue(queue: PracticeTaskQueueItem[]): InstalledPack[] {
  const packs = new Map<string, InstalledPack>();

  for (const item of queue) {
    if (item.pack && item.pack.id && item.pack.slug) {
      const snapshot: InstalledPack = {
        id: item.pack.id,
        slug: item.pack.slug,
        name: item.pack.name,
        installedAt: new Date().toISOString(),
      };
      packs.set(snapshot.id, snapshot);
    } else if (item.metadata?.packId && item.metadata.packSlug) {
      const snapshot: InstalledPack = {
        id: item.metadata.packId,
        slug: item.metadata.packSlug,
        name: item.metadata.packName ?? item.metadata.packSlug,
        installedAt: new Date().toISOString(),
      };
      packs.set(snapshot.id, snapshot);
    }
  }

  return Array.from(packs.values());
}
