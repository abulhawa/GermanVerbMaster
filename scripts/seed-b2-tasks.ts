import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { sql } from 'drizzle-orm'

import { db, getPool, inflections, lexemes, taskSpecs } from '@db'
import type { LexemePos } from '@shared'

type B2LexemePos = Extract<LexemePos, 'verb' | 'noun' | 'adjective'>

interface B2Scenario {
  key: string
  lemma: string
  pos: B2LexemePos
  gender?: 'der' | 'die' | 'das'
  english: string
  scenario: string
  taskInstructions: string
  wordBankItems: string[]
  keyPhrases: string[]
  grammarFocus: string
  inflectionForm: string
}

export const B2_SCENARIOS: B2Scenario[] = [
  {
    key: 'formal-work-email',
    lemma: 'antworten',
    pos: 'verb',
    english: 'to respond',
    scenario:
      'Ihre Teamleitung bittet um eine formelle Antwort auf eine Kundenanfrage zum Projektstatus.',
    taskInstructions:
      'Schreiben Sie eine kurze, formelle Antwort per E-Mail und nutzen Sie Konjunktiv II fuer einen hoeflichen Ton.',
    wordBankItems: ['wuerde', 'koennte', 'bezuglich', 'vielen Dank', 'mit freundlichen Gruessen'],
    keyPhrases: ['ich wuerde vorschlagen', 'vielen Dank fuer ihre nachricht', 'mit freundlichen Gruessen'],
    grammarFocus: 'Nutzen Sie Konjunktiv II fuer hoefliche Formulierungen im Geschaeftskontext.',
    inflectionForm: 'antworten',
  },
  {
    key: 'polite-complaint',
    lemma: 'beschweren',
    pos: 'verb',
    english: 'to complain',
    scenario:
      'Eine Lieferung ist deutlich verspaetet angekommen und Sie muessen eine sachliche Beschwerde senden.',
    taskInstructions:
      'Formulieren Sie eine hoefliche Beschwerde und schlagen Sie eine angemessene Loesung vor.',
    wordBankItems: ['wuerde', 'sollte', 'leider', 'bedauerlicherweise', 'ich bitte um'],
    keyPhrases: ['leider ist es zu einer verzoegerung gekommen', 'ich wuerde sie bitten', 'eine zeitnahe rueckmeldung'],
    grammarFocus: 'Nutzen Sie distanzierte, professionelle Sprache mit Konjunktiv II.',
    inflectionForm: 'beschweren',
  },
  {
    key: 'meeting-opinion',
    lemma: 'meinung',
    pos: 'noun',
    gender: 'die',
    english: 'opinion',
    scenario:
      'Im Teammeeting sollen Sie eine strukturierte Meinung zum neuen Arbeitsprozess aeussern.',
    taskInstructions:
      'Formulieren Sie Ihre Meinung differenziert, inklusive einer Einschraenkung und einer Empfehlung.',
    wordBankItems: ['meiner Meinung nach', 'jedoch', 'ich halte es fuer', 'es waere sinnvoll', 'insgesamt'],
    keyPhrases: ['meiner Meinung nach', 'jedoch', 'es waere sinnvoll'],
    grammarFocus: 'Kombinieren Sie Konnektoren und Konjunktiv II fuer differenzierte Aussagen.',
    inflectionForm: 'Meinung',
  },
  {
    key: 'professional-clarification',
    lemma: 'klaeren',
    pos: 'verb',
    english: 'to clarify',
    scenario:
      'Sie brauchen vor einem Kundentermin eine praezise Klaerung zu den vertraglichen Rahmenbedingungen.',
    taskInstructions:
      'Bitten Sie professionell um Klaerung und stellen Sie zwei konkrete Rueckfragen.',
    wordBankItems: ['koennten Sie', 'waere es moeglich', 'zur Klaerung', 'vorab', 'ich wuerde gerne wissen'],
    keyPhrases: ['koennten sie bitte', 'waere es moeglich', 'ich wuerde gerne wissen'],
    grammarFocus: 'Nutzen Sie indirekte Frageformen und Konjunktiv II fuer Hoeflichkeit.',
    inflectionForm: 'klaeren',
  },
  {
    key: 'polite-decline',
    lemma: 'bedauerlich',
    pos: 'adjective',
    english: 'regrettable',
    scenario:
      'Sie muessen eine Anfrage ablehnen, ohne die Geschaeftsbeziehung zu belasten.',
    taskInstructions:
      'Lehnen Sie die Anfrage freundlich ab und nennen Sie eine alternative Option.',
    wordBankItems: ['leider', 'bedauerlicherweise', 'waere', 'koennte', 'alternativ'],
    keyPhrases: ['leider koennen wir', 'bedauerlicherweise', 'alternativ koennten wir'],
    grammarFocus: 'Setzen Sie abschwaechende Formulierungen ein und bieten Sie eine Alternative an.',
    inflectionForm: 'bedauerlich',
  },
  {
    key: 'propose-solution',
    lemma: 'vorschlagen',
    pos: 'verb',
    english: 'to propose',
    scenario:
      'Im Projekt tritt ein Engpass auf und Sie sollen eine realistische Loesung im Teamchat formulieren.',
    taskInstructions:
      'Schlagen Sie eine konkrete Loesung vor und begruenden Sie diese kurz.',
    wordBankItems: ['ich schlage vor', 'es waere sinnvoll', 'sollten', 'umsetzen', 'zeitnah'],
    keyPhrases: ['ich schlage vor', 'es waere sinnvoll', 'wir sollten'],
    grammarFocus: 'Nutzen Sie Vorschlagsstrukturen und Konjunktiv II fuer Teamkommunikation.',
    inflectionForm: 'vorschlagen',
  },
  {
    key: 'formal-process-description',
    lemma: 'prozess',
    pos: 'noun',
    gender: 'der',
    english: 'process',
    scenario:
      'Sie dokumentieren einen internen Ablauf fuer neue Kolleginnen und Kollegen.',
    taskInstructions:
      'Beschreiben Sie den Ablauf formal in mindestens drei logischen Schritten.',
    wordBankItems: ['zunaechst', 'anschliessend', 'abschliessend', 'dokumentieren', 'pruefen'],
    keyPhrases: ['zunaechst', 'anschliessend', 'abschliessend'],
    grammarFocus: 'Arbeiten Sie mit klaren Sequenzmarkern und sachlicher Sprache.',
    inflectionForm: 'Prozess',
  },
  {
    key: 'formal-apology',
    lemma: 'entschuldigen',
    pos: 'verb',
    english: 'to apologize',
    scenario:
      'Ein Fehler im Bericht fuehrte zu Verwirrung. Sie sollen sich professionell entschuldigen.',
    taskInstructions:
      'Schreiben Sie eine formelle Entschuldigung und nennen Sie die naechsten Korrekturschritte.',
    wordBankItems: ['ich entschuldige mich', 'es tut mir leid', 'wuerde', 'korrigieren', 'umgehend'],
    keyPhrases: ['ich entschuldige mich', 'es tut mir leid', 'wir wuerden dies umgehend korrigieren'],
    grammarFocus: 'Verbinden Sie Entschuldigung und Loesungsorientierung in formellem Register.',
    inflectionForm: 'entschuldigen',
  },
  {
    key: 'formal-information-request',
    lemma: 'erfragen',
    pos: 'verb',
    english: 'to request information',
    scenario:
      'Sie benoetigen belastbare Zahlen fuer einen Bericht und schreiben an eine externe Partnerfirma.',
    taskInstructions:
      'Bitten Sie formell um Informationen und nennen Sie den gewuenschten Zeitrahmen.',
    wordBankItems: ['ich wuerde gerne wissen', 'koennten Sie mir', 'bis spaetestens', 'vorab', 'vielen Dank'],
    keyPhrases: ['ich wuerde gerne wissen', 'koennten sie mir', 'bis spaetestens'],
    grammarFocus: 'Nutzen Sie formelle Bitte-Formulierungen mit klarer Fristsetzung.',
    inflectionForm: 'erfragen',
  },
  {
    key: 'meeting-summary-outcome',
    lemma: 'zusammenfassen',
    pos: 'verb',
    english: 'to summarize',
    scenario:
      'Nach einer Besprechung sollen Sie die zentralen Ergebnisse an alle Beteiligten senden.',
    taskInstructions:
      'Fassen Sie die Ergebnisse knapp zusammen und benennen Sie die beschlossenen naechsten Schritte.',
    wordBankItems: ['zusammenfassend', 'wir haben beschlossen', 'naechster Schritt', 'zustaendig', 'frist'],
    keyPhrases: ['zusammenfassend', 'wir haben beschlossen', 'der naechste schritt'],
    grammarFocus: 'Nutzen Sie Ergebnis- und Beschlussformeln fuer formelle Protokollsprache.',
    inflectionForm: 'zusammenfassen',
  },
]

type DatabaseClient = typeof db

interface SeedCounts {
  scenarioCount: number
  lexemeCount: number
  inflectionCount: number
  taskSpecCount: number
}

function toLexemeId(key: string): string {
  return `lex:b2:${key}`
}

function toInflectionId(key: string): string {
  return `inf:b2:${key}`
}

function toTaskSpecId(key: string): string {
  return `task:b2:${key}`
}

function buildFeaturesForPos(pos: B2LexemePos): Record<string, unknown> {
  if (pos === 'verb') {
    return { tense: 'infinitive', mood: 'indicative' }
  }
  if (pos === 'noun') {
    return { case: 'nominative', number: 'singular' }
  }
  return { degree: 'positive' }
}

export async function seedB2Tasks(database: DatabaseClient = db): Promise<SeedCounts> {
  const lexemeRows = B2_SCENARIOS.map((scenario) => ({
    id: toLexemeId(scenario.key),
    lemma: scenario.lemma,
    language: 'de',
    pos: scenario.pos,
    gender: scenario.gender ?? null,
    metadata: {
      level: 'B2',
      english: scenario.english,
      tags: ['b2-exam', 'formal-register', 'writing'],
    } satisfies Record<string, unknown>,
    sourceIds: ['seed:b2'],
  }))

  const inflectionRows = B2_SCENARIOS.map((scenario) => ({
    id: toInflectionId(scenario.key),
    lexemeId: toLexemeId(scenario.key),
    form: scenario.inflectionForm,
    features: buildFeaturesForPos(scenario.pos),
    sourceRevision: 'seed:b2:v1',
  }))

  const taskSpecRows = B2_SCENARIOS.map((scenario) => ({
    id: toTaskSpecId(scenario.key),
    lexemeId: toLexemeId(scenario.key),
    pos: scenario.pos,
    taskType: 'b2_writing_prompt',
    renderer: 'b2_writing_prompt',
    prompt: {
      scenario: scenario.scenario,
      wordBankItems: scenario.wordBankItems,
      cefrLevel: 'B2',
      taskInstructions: scenario.taskInstructions,
    } satisfies Record<string, unknown>,
    solution: {
      keyPhrases: scenario.keyPhrases,
      grammarFocus: scenario.grammarFocus,
    } satisfies Record<string, unknown>,
    metadata: {
      source: 'seed:b2',
      scenarioKey: scenario.key,
    } satisfies Record<string, unknown>,
    revision: 1,
  }))

  await database.transaction(async (tx) => {
    await tx
      .insert(lexemes)
      .values(lexemeRows)
      .onConflictDoUpdate({
        target: lexemes.id,
        set: {
          lemma: sql`excluded.lemma`,
          language: sql`excluded.language`,
          pos: sql`excluded.pos`,
          gender: sql`excluded.gender`,
          metadata: sql`excluded.metadata`,
          sourceIds: sql`excluded.source_ids`,
          updatedAt: sql`now()`,
        },
      })

    await tx
      .insert(inflections)
      .values(inflectionRows)
      .onConflictDoUpdate({
        target: inflections.id,
        set: {
          lexemeId: sql`excluded.lexeme_id`,
          form: sql`excluded.form`,
          features: sql`excluded.features`,
          sourceRevision: sql`excluded.source_revision`,
          updatedAt: sql`now()`,
        },
      })

    await tx
      .insert(taskSpecs)
      .values(taskSpecRows)
      .onConflictDoUpdate({
        target: taskSpecs.id,
        set: {
          lexemeId: sql`excluded.lexeme_id`,
          pos: sql`excluded.pos`,
          taskType: sql`excluded.task_type`,
          renderer: sql`excluded.renderer`,
          prompt: sql`excluded.prompt`,
          solution: sql`excluded.solution`,
          metadata: sql`excluded.metadata`,
          revision: sql`excluded.revision`,
          updatedAt: sql`now()`,
        },
      })
  })

  return {
    scenarioCount: B2_SCENARIOS.length,
    lexemeCount: lexemeRows.length,
    inflectionCount: inflectionRows.length,
    taskSpecCount: taskSpecRows.length,
  }
}

export async function runSeedB2Tasks(): Promise<void> {
  const counts = await seedB2Tasks()
  console.log(
    `Seeded ${counts.taskSpecCount} b2_writing_prompt tasks (${counts.lexemeCount} lexemes, ${counts.inflectionCount} inflections).`,
  )
}

async function main(): Promise<void> {
  const pool = getPool()
  try {
    await runSeedB2Tasks()
  } finally {
    await pool.end()
  }
}

const scriptPath = fileURLToPath(import.meta.url)
const invokedPath = path.resolve(process.argv[1] ?? '')

if (scriptPath === invokedPath) {
  main().catch((error) => {
    console.error('Failed to seed B2 tasks', error)
    process.exit(1)
  })
}
