import type { PartOfSpeech } from '@shared/types';

import { collectSources } from './sources';
import type { AggregatedWord } from './types';

interface SourceMetadata {
  label: string;
  license: string;
  url?: string;
  notes?: string;
}

export interface AttributionEntry extends SourceMetadata {
  id: string;
  count: number;
  pos: PartOfSpeech[];
}

const SOURCE_CATALOG: Record<string, SourceMetadata> = {
  'Goethe-Institut': {
    label: 'Goethe-Institut curated list',
    license: 'CC BY-SA 4.0 (DWDS export)',
    url: 'https://www.goethe.de/',
  },
  'dwds-goethe-A1.csv': {
    label: 'DWDS Goethe-Zertifikat A1 export',
    license: 'CC BY-SA 4.0',
    url: 'https://www.dwds.de/',
  },
  'dwds-goethe-A2.csv': {
    label: 'DWDS Goethe-Zertifikat A2 export',
    license: 'CC BY-SA 4.0',
    url: 'https://www.dwds.de/',
  },
  'dwds-goethe-B1.csv': {
    label: 'DWDS Goethe-Zertifikat B1 export',
    license: 'CC BY-SA 4.0',
    url: 'https://www.dwds.de/',
  },
  'learn-deutsch-data:verbs': {
    label: 'Learn Deutsch community verbs',
    license: 'CC BY-SA 4.0 (community dataset)',
    url: 'https://github.com/savaged/learn-deutsch-data',
  },
  'learn-deutsch-data:nouns': {
    label: 'Learn Deutsch community nouns',
    license: 'CC BY-SA 4.0 (community dataset)',
    url: 'https://github.com/savaged/learn-deutsch-data',
  },
  'learn-deutsch-data:modal': {
    label: 'Learn Deutsch community modal verbs',
    license: 'CC BY-SA 4.0 (community dataset)',
    url: 'https://github.com/savaged/learn-deutsch-data',
  },
};

function resolveSourceMetadata(id: string): SourceMetadata {
  if (SOURCE_CATALOG[id]) {
    return SOURCE_CATALOG[id];
  }

  if (id.startsWith('pos_jsonl:')) {
    const [, slug] = id.split(':');
    return {
      label: `POS seed (${slug ?? 'unknown'}.jsonl)`,
      license: 'CC BY-SA 4.0 (internal data/pos source)',
      notes: 'Deterministic per-POS JSONL inventory committed in data/pos/',
    } satisfies SourceMetadata;
  }

  if (id.startsWith('enrichment:')) {
    const [, method] = id.split(':');
    return {
      label: `Enrichment applied (${method ?? 'unknown'})`,
      license: 'Composite – see enrichment snapshots',
      notes: 'Derived from stored enrichment provider payloads under data/enrichment/',
    } satisfies SourceMetadata;
  }

  return {
    label: id,
    license: 'unspecified – pending review',
  } satisfies SourceMetadata;
}

export function buildAttributionSummary(words: AggregatedWord[]): AttributionEntry[] {
  const summary = new Map<string, { count: number; pos: Set<PartOfSpeech> }>();
  for (const word of words) {
    const sources = collectSources(word);
    for (const sourceId of sources) {
      const record = summary.get(sourceId) ?? { count: 0, pos: new Set<PartOfSpeech>() };
      record.count += 1;
      record.pos.add(word.pos);
      summary.set(sourceId, record);
    }
  }

  return Array.from(summary.entries())
    .map(([id, { count, pos }]) => {
      const metadata = resolveSourceMetadata(id);
      return {
        id,
        count,
        pos: Array.from(pos).sort(),
        ...metadata,
      } satisfies AttributionEntry;
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
