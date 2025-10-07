import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc, type Firestore } from "firebase/firestore";

import {
  getFirebaseAuth,
  getFirebaseFirestore,
  getFirebaseInitializationError,
  getFirebaseConfigurationError,
} from "@/lib/firebase";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export type UserRole = "standard" | "admin";

export interface AuthProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  metadata: {
    createdAt: string;
    lastLoginAt: string;
  };
}

interface AuthContextValue {
  status: AuthStatus;
  profile: AuthProfile | null;
  role: UserRole;
  loading: boolean;
  initializationError: Error | null;
  firebaseReady: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<void>;
  refreshRole: () => Promise<UserRole>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const googleProvider = new GoogleAuthProvider();
const microsoftProvider = new OAuthProvider("microsoft.com");

function toProfile(user: User): AuthProfile {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    metadata: {
      createdAt: user.metadata.creationTime ?? new Date().toISOString(),
      lastLoginAt: user.metadata.lastSignInTime ?? new Date().toISOString(),
    },
  } satisfies AuthProfile;
}

async function ensureRoleDocument(firestore: Firestore, userId: string): Promise<UserRole> {
  const roleRef = doc(firestore, "userRoles", userId);
  const snapshot = await getDoc(roleRef);

  if (!snapshot.exists()) {
    await setDoc(roleRef, {
      role: "standard",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return "standard";
  }

  const role = snapshot.data()?.role;
  return role === "admin" ? "admin" : "standard";
}

async function upsertUserProfile(firestore: Firestore, user: User) {
  const profileRef = doc(firestore, "users", user.uid);

  await setDoc(
    profileRef,
    {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      photoURL: user.photoURL ?? null,
      lastLoginAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [role, setRole] = useState<UserRole>("standard");
  const configurationError = getFirebaseConfigurationError();
  const [initializationError, setInitializationError] = useState<Error | null>(() => {
    return getFirebaseInitializationError() ?? configurationError ?? null;
  });

  const firebaseReady = initializationError === null;

  const recordFirebaseError = useCallback((error: unknown) => {
    const normalized = error instanceof Error ? error : new Error(String(error));
    setInitializationError(normalized);
    return normalized;
  }, []);

  useEffect(() => {
    if (configurationError) {
      setInitializationError((existing) => existing ?? configurationError);
    }
  }, [configurationError]);

  useEffect(() => {
    if (initializationError) {
      setStatus("unauthenticated");
      setProfile(null);
      setRole("standard");
      return;
    }

    let unsubscribe = () => {};
    try {
      const auth = getFirebaseAuth();
      unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
        if (!user) {
          setStatus("unauthenticated");
          setProfile(null);
          setRole("standard");
          return;
        }

        setStatus("loading");
        setProfile(toProfile(user));
        try {
          const firestore = getFirebaseFirestore();
          await upsertUserProfile(firestore, user);
          const resolvedRole = await ensureRoleDocument(firestore, user.uid);
          setRole(resolvedRole);
          setStatus("authenticated");
        } catch (error) {
          console.error("[auth] Failed to synchronise user profile", error);
          recordFirebaseError(error);
          setStatus("unauthenticated");
          setProfile(null);
          setRole("standard");
        }
      });
    } catch (error) {
      console.error("[auth] Failed to initialise Firebase auth", error);
      recordFirebaseError(error);
      setStatus("unauthenticated");
      setProfile(null);
      setRole("standard");
      return;
    }

    return () => unsubscribe();
  }, [initializationError, recordFirebaseError]);

  const requireFirebaseAuth = useCallback(() => {
    if (initializationError) {
      throw initializationError;
    }

    try {
      return getFirebaseAuth();
    } catch (error) {
      throw recordFirebaseError(error);
    }
  }, [initializationError, recordFirebaseError]);

  const requireFirestore = useCallback(() => {
    if (initializationError) {
      throw initializationError;
    }

    try {
      return getFirebaseFirestore();
    } catch (error) {
      throw recordFirebaseError(error);
    }
  }, [initializationError, recordFirebaseError]);

  const refreshRole = useCallback(async () => {
    if (!profile) {
      setRole("standard");
      return "standard";
    }

    const firestore = requireFirestore();
    const resolved = await ensureRoleDocument(firestore, profile.uid);
    setRole(resolved);
    return resolved;
  }, [profile, requireFirestore]);

  const signInWithEmailHandler = useCallback(async (email: string, password: string) => {
    const auth = requireFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }, [requireFirebaseAuth]);

  const registerWithEmailHandler = useCallback(
    async (email: string, password: string, displayName: string) => {
      const auth = requireFirebaseAuth();
      const firestore = requireFirestore();
      const credentials = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName.trim().length) {
        await updateProfile(credentials.user, { displayName: displayName.trim() });
        await upsertUserProfile(firestore, credentials.user);
      }
      await ensureRoleDocument(firestore, credentials.user.uid);
    },
    [requireFirebaseAuth, requireFirestore],
  );

  const signInWithGoogleHandler = useCallback(async () => {
    const auth = requireFirebaseAuth();
    await signInWithPopup(auth, googleProvider);
  }, [requireFirebaseAuth]);

  const signInWithMicrosoftHandler = useCallback(async () => {
    const auth = requireFirebaseAuth();
    await signInWithPopup(auth, microsoftProvider);
  }, [requireFirebaseAuth]);

  const updateDisplayNameHandler = useCallback(
    async (displayName: string) => {
      const auth = requireFirebaseAuth();
      const current = auth.currentUser;
      if (!current) return;

      const trimmed = displayName.trim();
      await updateProfile(current, { displayName: trimmed });
      const firestore = requireFirestore();
      await updateDoc(doc(firestore, "users", current.uid), {
        displayName: trimmed || null,
        updatedAt: serverTimestamp(),
      });
      setProfile((existing) =>
        existing
          ? {
              ...existing,
              displayName: trimmed || null,
            }
          : existing,
      );
    },
    [requireFirebaseAuth, requireFirestore],
  );

  const signOutHandler = useCallback(async () => {
    const auth = requireFirebaseAuth();
    await signOut(auth);
    setRole("standard");
    setProfile(null);
    setStatus("unauthenticated");
  }, [requireFirebaseAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      role,
      loading: status === "loading",
      initializationError,
      firebaseReady,
      signInWithEmail: signInWithEmailHandler,
      registerWithEmail: registerWithEmailHandler,
      signInWithGoogle: signInWithGoogleHandler,
      signInWithMicrosoft: signInWithMicrosoftHandler,
      updateDisplayName: updateDisplayNameHandler,
      refreshRole,
      signOut: signOutHandler,
    }),
    [
      status,
      profile,
      role,
      initializationError,
      firebaseReady,
      signInWithEmailHandler,
      registerWithEmailHandler,
      signInWithGoogleHandler,
      signInWithMicrosoftHandler,
      updateDisplayNameHandler,
      refreshRole,
      signOutHandler,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
