import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const REQUIRED_ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

const OPTIONAL_ENV_KEYS = [
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_MEASUREMENT_ID",
] as const;

const ENV_TO_OPTION_KEY: Record<
  (typeof REQUIRED_ENV_KEYS)[number] | (typeof OPTIONAL_ENV_KEYS)[number],
  keyof FirebaseOptions
> = {
  VITE_FIREBASE_API_KEY: "apiKey",
  VITE_FIREBASE_AUTH_DOMAIN: "authDomain",
  VITE_FIREBASE_PROJECT_ID: "projectId",
  VITE_FIREBASE_APP_ID: "appId",
  VITE_FIREBASE_STORAGE_BUCKET: "storageBucket",
  VITE_FIREBASE_MESSAGING_SENDER_ID: "messagingSenderId",
  VITE_FIREBASE_MEASUREMENT_ID: "measurementId",
};

const REQUIRED_ENV_KEY_SET = new Set<string>(REQUIRED_ENV_KEYS);

class FirebaseConfigurationError extends Error {
  readonly missingKeys: string[];

  constructor(missingKeys: string[]) {
    const formatted = missingKeys.length
      ? missingKeys.length === 1
        ? missingKeys[0]
        : `${missingKeys.slice(0, -1).join(", ")} and ${missingKeys[missingKeys.length - 1]}`
      : "required Firebase environment variables";
    super(`Firebase configuration is incomplete. Set ${formatted} to enable cloud sync.`);
    this.name = "FirebaseConfigurationError";
    this.missingKeys = missingKeys;
  }
}

type ConfigResolution = {
  options: FirebaseOptions | null;
  missingKeys: string[];
};

let configResolution: ConfigResolution | undefined;
let configurationError: FirebaseConfigurationError | null | undefined;

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

let services: FirebaseServices | null = null;
let initializationError: Error | null = null;

function resolveConfig(): ConfigResolution {
  if (configResolution) {
    return configResolution;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const options: Partial<FirebaseOptions> = {};
  const missingKeys: string[] = [];

  for (const envKey of [...REQUIRED_ENV_KEYS, ...OPTIONAL_ENV_KEYS]) {
    const value = env[envKey];
    if (typeof value !== "string" || value.trim() === "") {
      if (REQUIRED_ENV_KEY_SET.has(envKey)) {
        missingKeys.push(envKey);
      }
      continue;
    }
    options[ENV_TO_OPTION_KEY[envKey]] = value.trim();
  }

  if (missingKeys.length) {
    configurationError = new FirebaseConfigurationError(missingKeys);
    configResolution = { options: null, missingKeys };
    return configResolution;
  }

  configurationError = null;
  configResolution = {
    options: options as FirebaseOptions,
    missingKeys: [],
  };
  return configResolution;
}

export function getFirebaseConfigurationError(): FirebaseConfigurationError | null {
  void resolveConfig();
  return configurationError ?? null;
}

export function getMissingFirebaseConfigKeys(): string[] {
  const { missingKeys } = resolveConfig();
  return [...missingKeys];
}

export function isFirebaseConfigured(): boolean {
  return getFirebaseConfigurationError() === null;
}

export function getFirebaseInitializationError(): Error | null {
  return initializationError ?? getFirebaseConfigurationError();
}

export function getFirebaseServices(): FirebaseServices {
  if (services) {
    return services;
  }

  const { options } = resolveConfig();
  if (!options) {
    const error = getFirebaseConfigurationError() ?? new FirebaseConfigurationError([]);
    initializationError = error;
    throw error;
  }

  try {
    const apps = getApps();
    const app = apps.length ? apps[0] : initializeApp(options);

    const auth = getAuth(app);
    void setPersistence(auth, browserLocalPersistence);

    const firestore = getFirestore(app);

    services = { app, auth, firestore };
    initializationError = null;
    return services;
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    initializationError = normalized;
    throw normalized;
  }
}

export function getFirebaseAuth() {
  return getFirebaseServices().auth;
}

export function getFirebaseFirestore() {
  return getFirebaseServices().firestore;
}

export { FirebaseConfigurationError };
