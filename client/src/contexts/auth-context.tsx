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
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

import { getFirebaseAuth, getFirebaseFirestore } from "@/lib/firebase";

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

async function ensureRoleDocument(userId: string): Promise<UserRole> {
  const firestore = getFirebaseFirestore();
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

async function upsertUserProfile(user: User) {
  const firestore = getFirebaseFirestore();
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

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setStatus("unauthenticated");
        setProfile(null);
        setRole("standard");
        return;
      }

      setStatus("loading");
      setProfile(toProfile(user));
      await upsertUserProfile(user);
      const resolvedRole = await ensureRoleDocument(user.uid);
      setRole(resolvedRole);
      setStatus("authenticated");
    });

    return () => unsubscribe();
  }, []);

  const refreshRole = useCallback(async () => {
    if (!profile) {
      setRole("standard");
      return "standard";
    }

    const resolved = await ensureRoleDocument(profile.uid);
    setRole(resolved);
    return resolved;
  }, [profile]);

  const signInWithEmailHandler = useCallback(async (email: string, password: string) => {
    const auth = getFirebaseAuth();
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const registerWithEmailHandler = useCallback(
    async (email: string, password: string, displayName: string) => {
      const auth = getFirebaseAuth();
      const credentials = await createUserWithEmailAndPassword(auth, email, password);
      if (displayName.trim().length) {
        await updateProfile(credentials.user, { displayName: displayName.trim() });
        await upsertUserProfile(credentials.user);
      }
      await ensureRoleDocument(credentials.user.uid);
    },
    [],
  );

  const signInWithGoogleHandler = useCallback(async () => {
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, googleProvider);
  }, []);

  const signInWithMicrosoftHandler = useCallback(async () => {
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, microsoftProvider);
  }, []);

  const updateDisplayNameHandler = useCallback(
    async (displayName: string) => {
      const auth = getFirebaseAuth();
      const current = auth.currentUser;
      if (!current) return;

      const trimmed = displayName.trim();
      await updateProfile(current, { displayName: trimmed });
      await updateDoc(doc(getFirebaseFirestore(), "users", current.uid), {
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
    [],
  );

  const signOutHandler = useCallback(async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
    setRole("standard");
    setProfile(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      profile,
      role,
      loading: status === "loading",
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
