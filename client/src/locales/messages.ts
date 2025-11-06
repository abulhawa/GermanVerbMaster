export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export interface LanguageToggleMessages {
  label: string;
  english: string;
  german: string;
}

export interface UserMenuMessages {
  ariaLabel: string;
  signInLabel: string;
  accountLabel: string;
  settingsLabel: string;
  languageLabel: string;
  theme: {
    toggleToDark: string;
    toggleToLight: string;
  };
  unknownUserInitial: string;
}

export interface HomeMessages {
  topBar: {
    focusLabel: string;
    title: string;
    signedOutSubtitle: string;
    signedInSubtitle: string;
  };
}

export interface AuthMessages {
  sidebar: {
    signedOutTitle: string;
    signedOutSubtitle: string;
    signedInTitle: string;
    signedInSubtitle: string;
    signInCta: string;
    createAccountCta: string;
    manageAccountCta: string;
    verifyReminder: string;
  };
  dialog: {
    accountTitle: string;
    accountDescription: string;
    signedInHeading: string;
    unknownUser: string;
    roleLabel: string;
    verifyEmailReminder: string;
    signOutLabel: string;
    signingOutLabel: string;
    signInTitle: string;
    signUpTitle: string;
    signInDescription: string;
    signUpDescription: string;
    signInTab: string;
    signUpTab: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    nameLabel: string;
    namePlaceholder: string;
    submitSignInLabel: string;
    submitSignUpLabel: string;
    signingInLabel: string;
    signingUpLabel: string;
    switchToSignUpPrompt: string;
    switchToSignUpCta: string;
    switchToSignInPrompt: string;
    switchToSignInCta: string;
    resendVerificationPrompt: string;
    resendVerificationCta: string;
    resendVerificationPendingLabel: string;
    resendVerificationSuccess: string;
    forgotPasswordPrompt: string;
    forgotPasswordCta: string;
    forgotPasswordPendingLabel: string;
    forgotPasswordSuccess: string;
    verificationNotice: string;
    successTitle: string;
    errorTitle: string;
    loadingStatus: string;
    validation: {
      emailRequired: string;
      passwordRequired: string;
    };
  };
  mobile: {
    accountLabel: string;
    signInLabel: string;
    manageAccountLabel: string;
  };
  feedback: {
    signInSuccess: string;
    signOutSuccess: string;
    signUpSuccess: string;
    unknownError: string;
  };
}

export interface AppMessages {
  languageToggle: LanguageToggleMessages;
  userMenu: UserMenuMessages;
  home: HomeMessages;
  auth: AuthMessages;
}

const MESSAGES: Record<Locale, AppMessages> = {
  en: {
    languageToggle: {
      label: 'Language',
      english: 'English',
      german: 'Deutsch',
    },
    userMenu: {
      ariaLabel: 'Open user menu',
      signInLabel: 'Open sign in dialog',
      accountLabel: 'Account',
      settingsLabel: 'Settings',
      languageLabel: 'Language',
      theme: {
        toggleToDark: 'Switch to dark theme',
        toggleToLight: 'Switch to light theme',
      },
      unknownUserInitial: '?',
    },
    home: {
      topBar: {
        focusLabel: 'Practice focus',
        title: 'Continue your personalised session',
        signedOutSubtitle: 'Sign in to sync your progress and unlock analytics.',
        signedInSubtitle: 'Signed in as {name}.',
      },
    },
    auth: {
      sidebar: {
        signedOutTitle: 'Sign in to save your progress',
        signedOutSubtitle: 'Create an account to sync practice history across devices.',
        signedInTitle: 'You\'re signed in',
        signedInSubtitle: 'Your attempts will sync securely in the background.',
        signInCta: 'Sign in',
        createAccountCta: 'Create an account',
        manageAccountCta: 'Manage account',
        verifyReminder: 'Verify your email to unlock syncing and admin tools.',
      },
      dialog: {
        accountTitle: 'Account',
        accountDescription: 'Review your current session details and manage sign-out.',
        signedInHeading: 'Signed in as',
        unknownUser: 'Unknown user',
        roleLabel: 'Role: {role}',
        verifyEmailReminder: 'Check your inbox to verify this email address.',
        signOutLabel: 'Sign out',
        signingOutLabel: 'Signing out…',
        signInTitle: 'Welcome back',
        signUpTitle: 'Create your account',
        signInDescription: 'Sign in to sync your study history and unlock analytics.',
        signUpDescription: 'Create an account to track progress and access personalised insights.',
        signInTab: 'Sign in',
        signUpTab: 'Sign up',
        emailLabel: 'Email',
        emailPlaceholder: 'you@example.com',
        passwordLabel: 'Password',
        passwordPlaceholder: 'Enter your password',
        nameLabel: 'Name',
        namePlaceholder: 'Your name',
        submitSignInLabel: 'Sign in',
        submitSignUpLabel: 'Create account',
        signingInLabel: 'Signing in…',
        signingUpLabel: 'Creating account…',
        switchToSignUpPrompt: 'Need an account?',
        switchToSignUpCta: 'Create one',
        switchToSignInPrompt: 'Already have an account?',
        switchToSignInCta: 'Sign in',
        resendVerificationPrompt: "Didn't receive the verification email?",
        resendVerificationCta: 'Resend verification email',
        resendVerificationPendingLabel: 'Sending…',
        resendVerificationSuccess: 'Verification email sent. Check your inbox.',
        forgotPasswordPrompt: 'Forgot your password?',
        forgotPasswordCta: 'Send reset link',
        forgotPasswordPendingLabel: 'Sending…',
        forgotPasswordSuccess: 'If that email exists, a reset link is on its way.',
        verificationNotice: 'We\'ve sent a verification email. Confirm it to finish setting up your account.',
        successTitle: 'Almost there',
        errorTitle: 'Something went wrong',
        loadingStatus: 'Refreshing account status…',
        validation: {
          emailRequired: 'Enter your email address.',
          passwordRequired: 'Enter your password.',
        },
      },
      mobile: {
        accountLabel: 'Account',
        signInLabel: 'Open sign in dialog',
        manageAccountLabel: 'Open account manager',
      },
      feedback: {
        signInSuccess: 'Signed in successfully',
        signOutSuccess: 'Signed out',
        signUpSuccess: 'Verification email sent',
        unknownError: 'Something went wrong. Please try again.',
      },
    },
  },
  de: {
    languageToggle: {
      label: 'Sprache',
      english: 'Englisch',
      german: 'Deutsch',
    },
    userMenu: {
      ariaLabel: 'Benutzermenü öffnen',
      signInLabel: 'Anmeldedialog öffnen',
      accountLabel: 'Konto',
      settingsLabel: 'Einstellungen',
      languageLabel: 'Sprache',
      theme: {
        toggleToDark: 'Zum dunklen Design wechseln',
        toggleToLight: 'Zum hellen Design wechseln',
      },
      unknownUserInitial: '?',
    },
    home: {
      topBar: {
        focusLabel: 'Übungsschwerpunkt',
        title: 'Setze deine personalisierte Sitzung fort',
        signedOutSubtitle: 'Melde dich an, um deinen Fortschritt zu synchronisieren und Analysen freizuschalten.',
        signedInSubtitle: 'Angemeldet als {name}.',
      },
    },
    auth: {
      sidebar: {
        signedOutTitle: 'Melde dich an, um deinen Fortschritt zu speichern',
        signedOutSubtitle: 'Erstelle ein Konto, um Übungsverläufe geräteübergreifend zu synchronisieren.',
        signedInTitle: 'Angemeldet',
        signedInSubtitle: 'Deine Versuche werden sicher im Hintergrund synchronisiert.',
        signInCta: 'Anmelden',
        createAccountCta: 'Konto erstellen',
        manageAccountCta: 'Konto verwalten',
        verifyReminder: 'Bestätige deine E-Mail, um Synchronisierung und Admin-Tools zu aktivieren.',
      },
      dialog: {
        accountTitle: 'Konto',
        accountDescription: 'Sieh dir deine aktuelle Sitzung an und melde dich bei Bedarf ab.',
        signedInHeading: 'Angemeldet als',
        unknownUser: 'Unbekannter Benutzer',
        roleLabel: 'Rolle: {role}',
        verifyEmailReminder: 'Prüfe deinen Posteingang und bestätige diese E-Mail-Adresse.',
        signOutLabel: 'Abmelden',
        signingOutLabel: 'Abmelden…',
        signInTitle: 'Willkommen zurück',
        signUpTitle: 'Konto erstellen',
        signInDescription: 'Melde dich an, um deinen Lernverlauf zu synchronisieren und Analysen freizuschalten.',
        signUpDescription: 'Erstelle ein Konto, um Fortschritte zu verfolgen und personalisierte Einblicke zu erhalten.',
        signInTab: 'Anmelden',
        signUpTab: 'Registrieren',
        emailLabel: 'E-Mail',
        emailPlaceholder: 'du@example.com',
        passwordLabel: 'Passwort',
        passwordPlaceholder: 'Passwort eingeben',
        nameLabel: 'Name',
        namePlaceholder: 'Dein Name',
        submitSignInLabel: 'Anmelden',
        submitSignUpLabel: 'Konto erstellen',
        signingInLabel: 'Melde an…',
        signingUpLabel: 'Erstelle Konto…',
        switchToSignUpPrompt: 'Noch kein Konto?',
        switchToSignUpCta: 'Jetzt erstellen',
        switchToSignInPrompt: 'Bereits ein Konto?',
        switchToSignInCta: 'Anmelden',
        resendVerificationPrompt: 'Keine Verifizierungs-E-Mail erhalten?',
        resendVerificationCta: 'Verifizierungs-E-Mail erneut senden',
        resendVerificationPendingLabel: 'Senden…',
        resendVerificationSuccess: 'Verifizierungs-E-Mail gesendet. Prüfe deinen Posteingang.',
        forgotPasswordPrompt: 'Passwort vergessen?',
        forgotPasswordCta: 'Link zum Zurücksetzen senden',
        forgotPasswordPendingLabel: 'Senden…',
        forgotPasswordSuccess: 'Falls die E-Mail existiert, ist ein Link zum Zurücksetzen unterwegs.',
        verificationNotice: 'Wir haben dir eine Verifizierungs-E-Mail gesendet. Bestätige sie, um dein Konto zu aktivieren.',
        successTitle: 'Fast geschafft',
        errorTitle: 'Etwas ist schiefgelaufen',
        loadingStatus: 'Aktualisiere Kontostatus…',
        validation: {
          emailRequired: 'Bitte gib deine E-Mail-Adresse ein.',
          passwordRequired: 'Bitte gib dein Passwort ein.',
        },
      },
      mobile: {
        accountLabel: 'Konto',
        signInLabel: 'Anmeldedialog öffnen',
        manageAccountLabel: 'Konto verwalten',
      },
      feedback: {
        signInSuccess: 'Erfolgreich angemeldet',
        signOutSuccess: 'Abgemeldet',
        signUpSuccess: 'Verifizierungs-E-Mail gesendet',
        unknownError: 'Etwas ist schiefgelaufen. Bitte versuche es erneut.',
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
