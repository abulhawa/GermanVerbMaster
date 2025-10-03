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
  offline: { title: string; description: string };
  error: { title: string; generic: string };
  status: { correct: string; incorrect: string; expectedAnswer: string };
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

export interface AppMessages {
  languageToggle: LanguageToggleMessages;
  practiceCard: PracticeCardMessages;
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
