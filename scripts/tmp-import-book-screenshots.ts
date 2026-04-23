import { appendFile, readFile } from 'node:fs/promises';

import type { EnrichmentMethod } from '@shared';

import { aggregateWords } from './seed/loaders/words.js';

type SupportedPos = 'N' | 'V' | 'Adj';

type WordRecord = {
  id: number;
  lemma: string;
  pos: SupportedPos;
  level: string | null;
  english: string | null;
  exampleDe: string | null;
  exampleEn: string | null;
  gender: string | null;
  plural: string | null;
  separable: boolean | null;
  aux: 'haben' | 'sein' | 'haben / sein' | null;
  praesensIch: string | null;
  praesensEr: string | null;
  praeteritum: string | null;
  partizipIi: string | null;
  perfekt: string | null;
  comparative: string | null;
  superlative: string | null;
  approved: boolean;
  complete: boolean;
  exportUid: string;
  exportedAt: Date | null;
  translations: Array<{
    value: string;
    source?: string | null;
    language?: string | null;
    confidence?: number | null;
  }> | null;
  examples: Array<{
    sentence?: string | null;
    translations?: Record<string, string | null | undefined> | null;
  }> | null;
  posAttributes: Record<string, unknown> | null;
  enrichmentAppliedAt: Date | null;
  enrichmentMethod: EnrichmentMethod | null;
  createdAt: Date;
  updatedAt: Date;
  sourcesCsv: string | null;
  sourceNotes: string | null;
};

type WordPatch = Partial<WordRecord> & {
  examples?: WordRecord['examples'];
};

const OUTPUT_FILES: Record<SupportedPos, string> = {
  N: 'data/pos/nouns.jsonl',
  V: 'data/pos/verbs.jsonl',
  Adj: 'data/pos/adjectives.jsonl',
};

const CANDIDATES: Record<SupportedPos, readonly string[]> = {
  N: [
    'Arbeitslosenquote',
    'Baugewerbe',
    'Dienstleistung',
    'Finanzbranche',
    'Fluggerätemechaniker',
    'Fluggerätemechanikerin',
    'Gastgewerbe',
    'Gesundheitswesen',
    'Gewerbe',
    'Gleitzeit',
    'Handwerk',
    'Homeoffice',
    'IT-Branche',
    'Konjunktur',
    'Lagerlogistik',
    'Pflegeheim',
    'Reservierung',
    'Schichtarbeit',
    'Sozialversicherungspflicht',
    'Vollzeitjob',
    'Wirtschaftsbranche',
    'Arbeitsstätte',
    'Bodenpersonal',
    'Fluglotse',
    'Fluglotsin',
    'Flugzeugabfertigung',
    'Gepäckabfertigung',
    'Handgepäck',
    'Luftfracht',
    'Passagier',
    'Passagierin',
    'Quereinsteiger',
    'Quereinsteigerin',
    'Spedition',
    'Arbeitsmittel',
    'Arbeitsschutz',
    'Brandmelder',
    'Brandschutzzeichen',
    'Feuerlöscher',
    'Feuermelder',
    'Gebotszeichen',
    'Glasscheibe',
    'Hinweisschild',
    'Notausgang',
    'Rettungszeichen',
    'Schutzausrüstung',
    'Schutzbrille',
    'Schutzhelm',
    'Sicherheitshinweis',
    'Sicherheitsschuh',
    'Sicherheitsvorschrift',
    'Stolpergefahr',
    'Straßenverkehrsordnung',
    'Verbotsschild',
    'Verbotszeichen',
    'Vorsichtsmaßnahme',
    'Berufsgenossenschaft',
    'Partnerschaft',
    'Wohlbefinden',
    'Zufriedenheit',
    'Arbeitsvertrag',
    'Jobmesse',
    'Labormitarbeiter',
    'Labormitarbeiterin',
    'Messmethode',
    'Online-Jobbörse',
    'Online-Stellenportal',
    'Pharmaunternehmen',
    'Qualitätskontrolle',
    'Stellenbörse',
    'Stellengesuch',
    'Stellensuche',
    'Vergütung',
    'Voraussetzung',
    'Stellenausschreibung',
    'Weiterbildung',
    'Bildungsweg',
    'Rückmeldung',
    'Versuchsablauf',
    'Absender',
    'Ansprechpartner',
    'Ansprechpartnerin',
    'Aufgabenbereich',
    'Aufgabengebiet',
    'Bewerbungsunterlagen',
    'Fachwissen',
    'Fähigkeitsprofil',
    'Gesprächspartner',
    'Gesprächspartnerin',
    'Kommunikationskompetenz',
    'Kritikfähigkeit',
    'Laborleiter',
    'Laborleiterin',
    'Teamfähigkeit',
    'Besichtigungstermin',
    'Gehaltsnachweis',
    'Immobilie',
    'Arbeitgeberverband',
    'Eigenverantwortung',
    'Einstiegsgehalt',
    'Firmenzentrale',
    'Freizeitausgleich',
    'Einstellungsgespräch',
    'Kündigungsregelung',
    'Urlaubsanspruch',
    'Betriebsrat',
    'Dienstplan',
    'Einweisung',
    'Hausordnung',
    'Haustechniker',
    'Haustechnikerin',
    'Mitarbeiterausweis',
    'Pflegedienstleitung',
    'Stationsleiter',
    'Stationsleiterin',
    'Verbandmaterial',
    'Willkommensmappe',
    'Betriebsversammlung',
    'Betriebszugehörigkeit',
    'Dienstreise',
    'Firmengelände',
    'Firmenparkplatz',
    'Lautsprecheranlage',
    'Ruhestand',
    'Telefonbenutzung',
    'Distanz',
    'Referent',
    'Referentin',
    'Arbeitsklima',
    'Beratungsprotokoll',
    'Gesprächsprotokoll',
    'Messestand',
    'Teamleiter',
    'Teamleiterin',
    'Konfliktgespräch',
    'Leistungsdruck',
    'Meinungsverschiedenheit',
    'Missverständnis',
    'Rivalität',
    'Überstunde',
    'Anweisung',
    'Ersatzfahrzeug',
    'Ersatzteil',
    'Gebrauchtwagen',
    'Inspektion',
    'Lieferverzögerung',
    'Reparaturauftrag',
    'Vertriebsleiter',
    'Vertriebsleiterin',
    'Hebebühne',
    'Kaufentscheidung',
    'Neuanschaffung',
    'Qualitätsproblem',
    'Tragfähigkeit',
    'Bedienungsproblem',
    'Kaffeesatzbehälter',
    'Reinigungstablette',
    'Bremsflüssigkeit',
    'Drahtbürste',
    'Frostschutzmittel',
    'Reifendruck',
    'Reifenprofil',
    'Reifenwechsel',
    'Wagenheber',
    'Carsharing',
    'Individualverkehr',
    'Lärmbelästigung',
    'Luftverschmutzung',
    'Verbrennungsmotor',
    'Verkehrsnetz',
  ],
  V: [
    'auffallen',
    'beaufsichtigen',
    'betreuen',
    'überwachen',
    'verwalten',
    'zubereiten',
    'abfertigen',
    'betreiben',
    'einstellen',
    'erweitern',
    'gründen',
    'umbauen',
    'umfassen',
    'vertreten',
    'befolgen',
    'behindern',
    'betätigen',
    'entsorgen',
    'freihalten',
    'hinweisen',
    'löschen',
    'schützen',
    'vermeiden',
    'verstauen',
    'schildern',
    'stolpern',
    'behaupten',
    'beobachten',
    'beinhalten',
    'dokumentieren',
    'recherchieren',
    'verlangen',
    'hinzufügen',
    'auswerten',
    'begeistern',
    'reizen',
    'vertiefen',
    'variieren',
    'beweisen',
    'anpacken',
    'erkennen',
    'erledigen',
    'erstatten',
    'kritisieren',
    'aushandeln',
    'erkundigen',
    'verschaffen',
    'antreten',
    'aushändigen',
    'einplanen',
    'beantragen',
    'bezuschussen',
    'zurechtfinden',
    'belästigen',
    'einhalten',
    'empfinden',
    'nahekommen',
    'wahrnehmen',
    'ausreden',
    'festlegen',
    'gestalten',
    'leiten',
    'verfassen',
    'ansprechen',
    'auswirken',
    'beilegen',
    'erarbeiten',
    'lüften',
    'nachvollziehen',
    'vergiften',
    'erholen',
    'genehmigen',
    'beklagen',
    'unternehmen',
    'kontaktieren',
    'lackieren',
    'vorgehen',
    'lagern',
    'anschaffen',
    'auftauchen',
    'verwenden',
    'beheben',
    'beseitigen',
    'entkalken',
    'erhitzen',
    'herunterladen',
    'nachfüllen',
    'reinigen',
    'säubern',
    'montieren',
    'anheben',
    'andrehen',
    'einfetten',
    'einfüllen',
    'einlagern',
    'festdrehen',
    'platzieren',
    'befürworten',
    'sperren',
    'überlasten',
    'verzichten',
    'zwingen',
  ],
  Adj: [
    'befristet',
    'stabil',
    'dreieckig',
    'quadratisch',
    'rutschig',
    'arbeitsunfähig',
    'entscheidend',
    'gemütlich',
    'aussagekräftig',
    'eigenverantwortlich',
    'fehlerfrei',
    'unbefristet',
    'überzeugend',
    'verständlich',
    'vielfältig',
    'vollständig',
    'ehrgeizig',
    'gründlich',
    'angespannt',
    'deprimierend',
    'mühsam',
    'angemessen',
    'mittelständisch',
    'gesetzlich',
    'chaotisch',
    'betrieblich',
    'ganztägig',
    'üblich',
    'aufdringlich',
    'intim',
    'unangenehm',
    'effektiv',
    'hilfsbereit',
    'aggressiv',
    'kooperativ',
    'nervig',
    'stickig',
    'repräsentativ',
    'preisgünstig',
    'vorhanden',
    'umgehend',
    'autonom',
    'energieintensiv',
    'überflüssig',
    'umweltfreundlich',
  ],
};

async function loadEnvFromFile(): Promise<void> {
  const contents = await readFile('.env', 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function makeWord(lemma: string, pos: SupportedPos): WordRecord {
  return {
    id: 0,
    lemma,
    pos,
    level: 'B2',
    english: null,
    exampleDe: null,
    exampleEn: null,
    gender: null,
    plural: null,
    separable: null,
    aux: null,
    praesensIch: null,
    praesensEr: null,
    praeteritum: null,
    partizipIi: null,
    perfekt: null,
    comparative: null,
    superlative: null,
    approved: true,
    complete: false,
    exportUid: '00000000-0000-0000-0000-000000000000',
    exportedAt: null,
    translations: null,
    examples: null,
    posAttributes: null,
    enrichmentAppliedAt: null,
    enrichmentMethod: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    sourcesCsv: null,
    sourceNotes: null,
  };
}

function applyPatch(word: WordRecord, patch: WordPatch): WordRecord {
  const next = { ...word };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

function normalizeGender(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'der' || normalized === 'die' || normalized === 'das') {
    return normalized;
  }
  if (normalized === 'masculine' || normalized === 'maskulin') {
    return 'der';
  }
  if (normalized === 'feminine' || normalized === 'feminin') {
    return 'die';
  }
  if (normalized === 'neuter' || normalized === 'neutrum') {
    return 'das';
  }
  return value;
}

function normalizeAux(value: string | null | undefined): WordRecord['aux'] {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'haben' || normalized === 'sein') {
    return normalized;
  }
  if (normalized.replace(/\s+/g, '') === 'haben/sein') {
    return 'haben / sein';
  }
  return null;
}

function looksSuspiciousGermanExample(
  exampleDe: string | null | undefined,
  exampleEn: string | null | undefined,
): boolean {
  const de = exampleDe?.trim();
  if (!de) {
    return false;
  }
  const en = exampleEn?.trim();
  if (en && de.toLowerCase() === en.toLowerCase()) {
    return true;
  }

  const lower = ` ${de.toLowerCase()} `;
  const germanSignals = [
    ' der ',
    ' die ',
    ' das ',
    ' ein ',
    ' eine ',
    ' im ',
    ' am ',
    ' auf ',
    ' mit ',
    ' für ',
    ' und ',
    ' ist ',
    ' sind ',
    ' wird ',
    ' ich ',
    ' wir ',
    ' sie ',
  ];
  const englishSignals = [
    ' the ',
    ' and ',
    ' is ',
    ' are ',
    ' was ',
    ' were ',
    ' with ',
    ' for ',
    ' in ',
    ' of ',
    ' to ',
  ];

  const germanScore = germanSignals.filter((token) => lower.includes(token)).length;
  const englishScore = englishSignals.filter((token) => lower.includes(token)).length;

  return englishScore >= 2 && germanScore === 0;
}

function sanitizePatch(word: WordRecord, patch: WordPatch): WordPatch {
  const sanitized: WordPatch = { ...patch };

  if (word.pos === 'N' && typeof sanitized.gender === 'string') {
    sanitized.gender = normalizeGender(sanitized.gender);
  }

  if (word.pos === 'V' && typeof sanitized.aux === 'string') {
    sanitized.aux = normalizeAux(sanitized.aux);
  }

  return sanitized;
}

function ensureQuality(word: WordRecord): WordRecord {
  const next = { ...word };
  if (looksSuspiciousGermanExample(next.exampleDe, next.exampleEn)) {
    next.exampleDe = null;
    next.exampleEn = null;
    next.examples = null;
  }
  if (next.pos === 'N') {
    next.gender = normalizeGender(next.gender);
  }
  if (next.pos === 'V') {
    next.aux = normalizeAux(next.aux);
    if (next.separable === null) {
      const presentForms = [next.praesensIch, next.praesensEr].filter(Boolean).join(' ');
      if (presentForms.includes(' ')) {
        next.separable = true;
      }
    }
  }
  return next;
}

function isComplete(word: WordRecord): boolean {
  if (!word.english?.trim() || !word.exampleDe?.trim() || !word.exampleEn?.trim()) {
    return false;
  }

  switch (word.pos) {
    case 'N':
      return Boolean(word.gender?.trim() && word.plural?.trim());
    case 'V':
      return Boolean(word.praeteritum?.trim() && word.partizipIi?.trim() && word.perfekt?.trim());
    case 'Adj':
      return Boolean(word.comparative?.trim() && word.superlative?.trim());
    default:
      return false;
  }
}

function toCanonicalRecord(word: WordRecord): Record<string, unknown> {
  const base: Record<string, unknown> = {
    lemma: word.lemma,
    approved: true,
    level: 'B2',
    english: word.english,
    example_de: word.exampleDe,
    example_en: word.exampleEn,
    examples: [
      {
        de: word.exampleDe,
        en: word.exampleEn,
      },
    ],
  };

  if (word.pos === 'N') {
    base.noun = {
      gender: word.gender,
      plural: word.plural,
    };
  }

  if (word.pos === 'V') {
    const verb: Record<string, unknown> = {
      aux: word.aux,
      praeteritum: word.praeteritum,
      partizipIi: word.partizipIi,
      perfekt: word.perfekt,
    };
    if (typeof word.separable === 'boolean') {
      verb.separable = word.separable;
    }
    if (word.praesensIch || word.praesensEr) {
      verb.praesens = {};
      if (word.praesensIch) {
        (verb.praesens as Record<string, string>).ich = word.praesensIch;
      }
      if (word.praesensEr) {
        (verb.praesens as Record<string, string>).er = word.praesensEr;
      }
    }
    base.verb = verb;
  }

  if (word.pos === 'Adj') {
    base.adjective = {
      comparative: word.comparative,
      superlative: word.superlative,
    };
  }

  return base;
}

async function main(): Promise<void> {
  await loadEnvFromFile();
  const { buildGroqWordEnrichment } = await import('../server/services/groq-word-enrichment.js');
  const { buildProviderFirstWordEnrichment } = await import(
    '../server/services/provider-word-enrichment.js'
  );

  const existing = await aggregateWords(process.cwd());
  const existingKeys = new Set(existing.map((entry) => `${entry.lemma}::${entry.pos}`));

  for (const pos of ['N', 'V', 'Adj'] as const) {
    const candidates = Array.from(new Set(CANDIDATES[pos])).sort((left, right) =>
      left.localeCompare(right, 'de-DE'),
    );
    const added: string[] = [];
    const skippedExisting: string[] = [];
    const skippedIncomplete: string[] = [];
    const output: string[] = [];

    for (const lemma of candidates) {
      const key = `${lemma}::${pos}`;
      if (existingKeys.has(key)) {
        skippedExisting.push(lemma);
        continue;
      }

      let word = makeWord(lemma, pos);

      const groqPatch = sanitizePatch(word, await buildGroqWordEnrichment(word, { overwrite: false }));
      word = ensureQuality(applyPatch(word, groqPatch));

      const providerPatch = sanitizePatch(
        word,
        await buildProviderFirstWordEnrichment(word, { useGroqFallback: false }),
      );
      word = ensureQuality(applyPatch(word, providerPatch));

      if (!isComplete(word) && process.env.GROQ_API_KEY) {
        const retryWord = {
          ...word,
          exampleDe: null,
          exampleEn: null,
          examples: null,
        };
        const retryPatch = sanitizePatch(
          retryWord,
          await buildGroqWordEnrichment(retryWord, { overwrite: false }),
        );
        word = ensureQuality(applyPatch(retryWord, retryPatch));
      }

      if (!isComplete(word)) {
        skippedIncomplete.push(lemma);
        continue;
      }

      output.push(JSON.stringify(toCanonicalRecord(word)));
      added.push(lemma);
      existingKeys.add(key);
    }

    if (output.length > 0) {
      await appendFile(OUTPUT_FILES[pos], `${output.join('\n')}\n`, 'utf8');
    }

    console.log(
      JSON.stringify(
        {
          pos,
          added: added.length,
          skippedExisting: skippedExisting.length,
          skippedIncomplete: skippedIncomplete.length,
          incompleteLemmas: skippedIncomplete,
        },
        null,
        2,
      ),
    );
  }
}

await main();
