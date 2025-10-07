import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

let services: FirebaseServices | null = null;

function createConfig() {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
  };
}

export function getFirebaseServices(): FirebaseServices {
  if (services) {
    return services;
  }

  const apps = getApps();
  const app = apps.length ? apps[0] : initializeApp(createConfig());

  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence);

  const firestore = getFirestore(app);

  services = { app, auth, firestore };
  return services;
}

export function getFirebaseAuth() {
  return getFirebaseServices().auth;
}

export function getFirebaseFirestore() {
  return getFirebaseServices().firestore;
}
