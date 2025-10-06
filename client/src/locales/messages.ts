import type { TaskType } from '@shared';

export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export interface LanguageToggleMessages {
  label: string;
  english: string;
  german: string;
}

export interface PracticeCardMessages {
  offline: { title: string; description: string; announce: string };
  error: { title: string; generic: string };
  status: { correct: string; incorrect: string; expectedAnswer: string };
  header: {
    appName: string;
    profileLabel: string;
    scoreLabel: string;
    accuracyLabel: string;
    streakLabel: string;
    streakUnit: string;
  };
  hints: {
    label: string;
    toggle: string;
    englishPrefix: string;
    expectedAnswerPrefix: string;
    expectedFormPrefix: string;
    articleLabel: string;
  };
  exampleLabel: string;
  metadata: { sourceLabel: string };
  actions: { submit: string; pronounceSrLabel: string };
  loadingNext: string;
  progress: {
    label: string;
    completedLabel: string;
  };
  caseLabels: Record<'nominative' | 'accusative' | 'dative' | 'genitive', string>;
  numberLabels: Record<'singular' | 'plural', string>;
  degreeLabels: Record<'positive' | 'comparative' | 'superlative', string>;
  conjugate: {
    placeholder: string;
    ariaLabel: string;
    instruction: string;
    subjectSuffix: string;
    tenseLabels: {
      participle: string;
      past: string;
      present: string;
      fallback: string;
    };
    subjectLabels: {
      singular: Record<1 | 2 | 3, string>;
      plural: Record<1 | 2 | 3, string>;
      fallback?: string;
    };
  };
  noun: {
    placeholder: string;
    ariaLabel: string;
    instruction: string;
  };
  adjective: {
    placeholder: string;
    ariaLabel: string;
    syntacticFrameLabel: string;
    instruction: string;
  };
  unsupported: {
    title: string;
    description: string;
    retry: string;
  };
}

interface PluralizedMessage {
  singular: string;
  plural: string;
}

export interface ProgressDisplayMessages {
  headline: string;
  description: {
    withCefr: string;
    withoutCefr: string;
  };
  taskDescriptor: {
    mix: PluralizedMessage;
    single: string;
  };
  taskTypeLabels: Partial<Record<TaskType, string>>;
  cefrLevel: string;
  streak: {
    label: PluralizedMessage;
  };
  cards: {
    accuracy: {
      title: string;
      basedOn: PluralizedMessage;
    };
    lexemes: {
      title: string;
      subtitle: string;
    };
    lastAttempt: {
      title: string;
      subtitle: string;
      never: string;
    };
  };
  performance: {
    heading: string;
  };
  attemptsSummary: {
    logged: PluralizedMessage;
    none: string;
  };
  insight: string;
}

export interface AppMessages {
  languageToggle: LanguageToggleMessages;
  practiceCard: PracticeCardMessages;
  progressDisplay: ProgressDisplayMessages;
}

const PRACTICE_CARD_PLACEHOLDER = '{taskType}' satisfies `{${string}}`;

const MESSAGES: Record<Locale, AppMessages> = {
  en: {
    languageToggle: {
      label: 'Language',
      english: 'English',
      german: 'Deutsch',
    },
    practiceCard: {
      offline: {
        title: 'Saved offline',
        description: "We'll sync this attempt once you're back online.",
        announce: "Practice attempt stored for offline sync. We'll sync this attempt once you're back online.",
      },
      error: {
        title: 'Error',
        generic: 'Failed to record practice attempt',
      },
      status: {
        correct: 'Correct',
        incorrect: 'Try again',
        expectedAnswer: 'Expected answer:',
      },
      header: {
        appName: 'Wortschatz',
        profileLabel: 'Profile',
        scoreLabel: 'Points',
        accuracyLabel: 'Accuracy',
        streakLabel: 'Streak',
        streakUnit: 'days',
      },
      hints: {
        label: 'Hint',
        toggle: 'Tap to reveal the hint',
        englishPrefix: 'English:',
        expectedAnswerPrefix: 'Expected answer:',
        expectedFormPrefix: 'Expected form:',
        articleLabel: 'Article:',
      },
      exampleLabel: 'Example',
      metadata: {
        sourceLabel: 'Source:',
      },
      actions: {
        submit: 'Check',
        pronounceSrLabel: 'Play pronunciation',
      },
      loadingNext: 'Loading next task…',
      progress: {
        label: 'Day {current}/{target}',
        completedLabel: 'Completed {count}',
      },
      caseLabels: {
        nominative: 'Nominative',
        accusative: 'Accusative',
        dative: 'Dative',
        genitive: 'Genitive',
      },
      numberLabels: {
        singular: 'Singular',
        plural: 'Plural',
      },
      degreeLabels: {
        positive: 'Positive',
        comparative: 'Comparative',
        superlative: 'Superlative',
      },
      conjugate: {
        placeholder: 'Enter your answer',
        ariaLabel: 'Enter answer',
        instruction: 'Conjugate "{lemma}" in the {tenseLabel} tense',
        subjectSuffix: ' ({subjectLabel})',
        tenseLabels: {
          participle: 'Past participle',
          past: 'Simple past',
          present: 'Present',
          fallback: 'form',
        },
        subjectLabels: {
          singular: {
            1: 'I',
            2: 'you (singular)',
            3: 'he/she/it',
          },
          plural: {
            1: 'we',
            2: 'you (plural)',
            3: 'they',
          },
          fallback: 'the requested subject',
        },
      },
      noun: {
        placeholder: 'e.g. die Kinder',
        ariaLabel: 'Enter plural form',
        instruction: 'Give the {caseLabel} {numberLabel} form of "{lemma}"',
      },
      adjective: {
        placeholder: 'e.g. schneller',
        ariaLabel: 'Enter adjective form',
        syntacticFrameLabel: 'Frame:',
        instruction: 'Give the {degreeLabel} form of "{lemma}"',
      },
      unsupported: {
        title: 'Renderer missing',
        description: `No renderer is available for task type ${PRACTICE_CARD_PLACEHOLDER}.`,
        retry: 'Please try again later.',
      },
    },
    progressDisplay: {
      headline: 'Progress overview',
      description: {
        withCefr: 'Progress for {descriptor} · {cefr}.',
        withoutCefr: 'Progress for {descriptor}.',
      },
      taskDescriptor: {
        mix: {
          singular: 'Task mix ({count} type)',
          plural: 'Task mix ({count} types)',
        },
        single: 'Task type {taskType}',
      },
      taskTypeLabels: {
        conjugate_form: 'Conjugation',
        noun_case_declension: 'Noun declension',
        adj_ending: 'Adjective endings',
      },
      cefrLevel: 'Level {level}',
      streak: {
        label: {
          singular: '{count}-day streak',
          plural: '{count}-day streak',
        },
      },
      cards: {
        accuracy: {
          title: 'Accuracy',
          basedOn: {
            singular: 'Based on {count} attempt',
            plural: 'Based on {count} attempts',
          },
        },
        lexemes: {
          title: 'Lexemes practiced',
          subtitle: 'Unique lexemes with recorded attempts',
        },
        lastAttempt: {
          title: 'Last attempt',
          subtitle: 'Updated after each submitted answer',
          never: 'No attempts recorded yet',
        },
      },
      performance: {
        heading: 'Overall performance',
      },
      attemptsSummary: {
        logged: {
          singular: '{count} attempt logged',
          plural: '{count} attempts logged',
        },
        none: 'No attempts saved yet',
      },
      insight: 'Each answer improves your mixed practice sessions with better recommendations.',
    },
  },
  de: {
    languageToggle: {
      label: 'Sprache',
      english: 'Englisch',
      german: 'Deutsch',
    },
    practiceCard: {
      offline: {
        title: 'Offline gespeichert',
        description: 'Wir synchronisieren deinen Versuch, sobald du wieder online bist.',
        announce: 'Übung wurde für die Offline-Synchronisierung gespeichert. Wir synchronisieren den Versuch, sobald du wieder online bist.',
      },
      error: {
        title: 'Fehler',
        generic: 'Übung konnte nicht gespeichert werden',
      },
      status: {
        correct: 'Richtig',
        incorrect: 'Versuch es erneut',
        expectedAnswer: 'Erwartete Antwort:',
      },
      header: {
        appName: 'Wortschatz',
        profileLabel: 'Profil',
        scoreLabel: 'Punkte',
        accuracyLabel: 'Genauigkeit',
        streakLabel: 'Serie',
        streakUnit: 'Tage',
      },
      hints: {
        label: 'Hinweis',
        toggle: 'Tippe, um den Hinweis anzuzeigen',
        englishPrefix: 'Englisch:',
        expectedAnswerPrefix: 'Erwartete Antwort:',
        expectedFormPrefix: 'Erwartete Form:',
        articleLabel: 'Artikel:',
      },
      exampleLabel: 'Beispiel',
      metadata: {
        sourceLabel: 'Quelle:',
      },
      actions: {
        submit: 'Prüfen',
        pronounceSrLabel: 'Aussprache abspielen',
      },
      loadingNext: 'Lädt nächste Aufgabe…',
      progress: {
        label: 'Tag {current}/{target}',
        completedLabel: '{count} abgeschlossen',
      },
      caseLabels: {
        nominative: 'Nominativ',
        accusative: 'Akkusativ',
        dative: 'Dativ',
        genitive: 'Genitiv',
      },
      numberLabels: {
        singular: 'Singular',
        plural: 'Plural',
      },
      degreeLabels: {
        positive: 'Positiv',
        comparative: 'Komparativ',
        superlative: 'Superlativ',
      },
      conjugate: {
        placeholder: 'Gib deine Antwort ein',
        ariaLabel: 'Antwort eingeben',
        instruction: 'Konjugiere „{lemma}“ in der {tenseLabel}-Form',
        subjectSuffix: ' ({subjectLabel})',
        tenseLabels: {
          participle: 'Partizip II',
          past: 'Präteritum',
          present: 'Präsens',
          fallback: 'Form',
        },
        subjectLabels: {
          singular: {
            1: 'ich',
            2: 'du',
            3: 'er/sie/es',
          },
          plural: {
            1: 'wir',
            2: 'ihr',
            3: 'sie',
          },
          fallback: 'die angegebene Person',
        },
      },
      noun: {
        placeholder: 'z. B. die Kinder',
        ariaLabel: 'Pluralform eingeben',
        instruction: 'Bilde die {caseLabel} {numberLabel}-Form von „{lemma}“',
      },
      adjective: {
        placeholder: 'z. B. schneller',
        ariaLabel: 'Adjektivform eingeben',
        syntacticFrameLabel: 'Rahmen:',
        instruction: 'Bilde die {degreeLabel}form von „{lemma}“',
      },
      unsupported: {
        title: 'Renderer fehlt',
        description: `Für den Aufgabentyp ${PRACTICE_CARD_PLACEHOLDER} ist noch kein Renderer hinterlegt.`,
        retry: 'Bitte versuche es später erneut.',
      },
    },
    progressDisplay: {
      headline: 'Fortschrittsübersicht',
      description: {
        withCefr: 'Fortschritt für {descriptor} · {cefr}.',
        withoutCefr: 'Fortschritt für {descriptor}.',
      },
      taskDescriptor: {
        mix: {
          singular: 'Aufgabenmix ({count} Typ)',
          plural: 'Aufgabenmix ({count} Typen)',
        },
        single: 'Aufgabentyp {taskType}',
      },
      taskTypeLabels: {
        conjugate_form: 'Konjugation',
        noun_case_declension: 'Nominaldeklination',
        adj_ending: 'Adjektivendungen',
      },
      cefrLevel: 'Niveau {level}',
      streak: {
        label: {
          singular: 'Serie von {count} Tag',
          plural: 'Serie von {count} Tagen',
        },
      },
      cards: {
        accuracy: {
          title: 'Genauigkeit',
          basedOn: {
            singular: 'Basierend auf {count} Versuch',
            plural: 'Basierend auf {count} Versuchen',
          },
        },
        lexemes: {
          title: 'Geübte Lexeme',
          subtitle: 'Eindeutige Lexeme mit aufgezeichneten Versuchen',
        },
        lastAttempt: {
          title: 'Letzter Versuch',
          subtitle: 'Aktualisiert nach jeder Antwort',
          never: 'Noch keine Versuche aufgezeichnet',
        },
      },
      performance: {
        heading: 'Gesamtleistung',
      },
      attemptsSummary: {
        logged: {
          singular: '{count} Versuch gespeichert',
          plural: '{count} Versuche gespeichert',
        },
        none: 'Noch keine Versuche gespeichert',
      },
      insight: 'Jede Antwort verbessert deine gemischten Übungen mit besseren Empfehlungen.',
    },
  },
};

export function getMessages(locale: Locale): AppMessages {
  return MESSAGES[locale] ?? MESSAGES[DEFAULT_LOCALE];
}

export function isSupportedLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}

export function formatUnsupportedRendererMessage(
  descriptionTemplate: string,
  taskType: TaskType,
): string {
  return descriptionTemplate.replace(PRACTICE_CARD_PLACEHOLDER, taskType);
}
