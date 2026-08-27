"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentAuthUser,
  loginWithCredentials,
  LoginDto,
} from "@/lib/auth-api";
import { ApiError } from "@/lib/api-client";
import {
  AUTH_SESSION_CHANGED_EVENT,
  AuthSession,
  clearAuthSession,
  createAuthSession,
  readAuthSession,
  saveAuthSession,
} from "@/lib/auth-session";
import { Tenant, User, UserRole } from "@/types/saas-schema";

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  role: UserRole | null;
  loading: boolean;
  login: (credentials: LoginDto) => Promise<AuthSession>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const syncSession = () => {
      setSession(readAuthSession());
    };

    window.addEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    const controller = new AbortController();
    const storedSession = readAuthSession();
    setSession(storedSession);

    if (!storedSession) {
      setLoading(false);
    } else {
      void getCurrentAuthUser(controller.signal)
        .then((currentUser) => {
          const latestSession = readAuthSession();
          if (
            !latestSession ||
            latestSession.accessToken !== storedSession.accessToken
          ) {
            return;
          }

          const refreshedSession = createAuthSession(
            storedSession.accessToken,
            currentUser,
          );
          saveAuthSession(refreshedSession);
          setSession(refreshedSession);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          if (error instanceof ApiError && error.status === 401) {
            clearAuthSession();
            setSession(null);
          }
          // Ante una falla transitoria conservamos la sesion local. La API
          // sigue validando estado y rol en PostgreSQL para cada operacion.
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }

    return () => {
      controller.abort();
      window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, syncSession);
    };
  }, []);

  useEffect(() => {
    if (!session?.expiresAt) return;

    const remainingTime = session.expiresAt - Date.now();
    if (remainingTime <= 0) {
      clearAuthSession();
      return;
    }

    const timeout = window.setTimeout(
      clearAuthSession,
      Math.min(remainingTime, 2_147_483_647),
    );
    return () => window.clearTimeout(timeout);
  }, [session?.expiresAt]);

  const login = useCallback(async (credentials: LoginDto) => {
    setLoading(true);

    try {
      const authenticatedSession = await loginWithCredentials(credentials);
      saveAuthSession(authenticatedSession);
      setSession(authenticatedSession);
      return authenticatedSession;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    clearAuthSession();
    setSession(null);
    router.replace("/iniciar-sesion");
  }, [router]);

  const value: AuthContextType = {
    user: session?.user ?? null,
    tenant: session?.tenant ?? null,
    role: session?.user.role ?? null,
    loading,
    login,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
