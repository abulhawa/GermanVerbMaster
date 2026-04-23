import { describe, expect, it } from 'vitest';

import { ANDROID_B2_BERUF_SOURCE, ANDROID_B2_BERUF_VERSION } from '@shared/content-sources';

import { parseBundledWortschatzCsv } from '../../../scripts/seed/loaders/wortschatz';

describe('bundled Wortschatz CSV loader', () => {
  it('normalizes headers, POS labels, noun metadata, and duplicate rows', () => {
    const csv = [
      'Article Prefix,Word,English Translation,Example Sentence,English Translation Sentence,POS',
      'der,"Arbeitsvertrag, Arbeitsverträge",employment contract,Der Arbeitsvertrag ist unterschrieben.,The employment contract is signed.,N',
      'der,"Arbeitsvertrag, Arbeitsverträge",employment contract,Der Arbeitsvertrag ist unterschrieben.,The employment contract is signed.,N',
      ',zuverlässig,reliable,Sie arbeitet zuverlässig.,She works reliably.,Adjektiv',
      ',zusammenarbeiten,to work together,Wir arbeiten eng zusammen.,We work closely together.,Verb',
    ].join('\n');

    const rows = parseBundledWortschatzCsv(csv);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      lemma: 'Arbeitsvertrag',
      pos: 'N',
      plural: 'Arbeitsverträge',
      gender: 'der',
      english: 'employment contract',
      exampleDe: 'Der Arbeitsvertrag ist unterschrieben.',
      exampleEn: 'The employment contract is signed.',
      approved: true,
      sourcesCsv: ANDROID_B2_BERUF_SOURCE,
      sourceNotes: ANDROID_B2_BERUF_VERSION,
    });
    expect(rows[1]).toMatchObject({
      lemma: 'zuverlässig',
      pos: 'Adj',
    });
    expect(rows[2]).toMatchObject({
      lemma: 'zusammenarbeiten',
      pos: 'V',
    });
  });
});
