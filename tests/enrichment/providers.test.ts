import { describe, expect, it } from 'vitest';

import { extractVerbForms } from '../../scripts/enrichment/providers';

describe('extractVerbForms', () => {
  it('parses verb forms from template parameters with suffixes', () => {
    const content = `
      {{Deutsch Verb Flexion
        | PräteritumSg = {{l|de|ging}}
        | Partizip II = {{l|de|gegangen|gehen#Verb}}
        | PerfektWir = hat {{l|de|gegangen|gehen#Verb}}
        | Hilfsverb = haben
      }}
    `;

    const result = extractVerbForms(content);

    expect(result).toEqual({
      praeteritum: 'ging',
      partizipIi: 'gegangen',
      perfekt: 'hat gegangen',
      aux: 'haben',
    });
  });

  it('falls back to bolded section headings when templates are missing', () => {
    const content = `
      '''Präteritum:''' {{l|de|ging}}
      '''Partizip II:''' {{l|de|gegangen|gehen#Verb}}
      '''Hilfsverb:''' sein
      '''Perfekt:''' ist {{l|de|gegangen|gehen#Verb}}
    `;

    const result = extractVerbForms(content);

    expect(result).toEqual({
      praeteritum: 'ging',
      partizipIi: 'gegangen',
      perfekt: 'ist gegangen',
      aux: 'sein',
    });
  });

  it('derives the perfect form from auxiliary and partizip when missing', () => {
    const content = `
      {{Deutsch Verb Übersicht
        | gehen
        | geht
        | ging
        | gegangen
        | Hilfsverb = sein
      }}
    `;

    const result = extractVerbForms(content);

    expect(result).toEqual({
      praeteritum: 'ging',
      partizipIi: 'gegangen',
      perfekt: 'ist gegangen',
      aux: 'sein',
    });
  });
});
