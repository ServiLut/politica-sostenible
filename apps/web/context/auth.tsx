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
  logoutAllSessions,
} from "@/lib/auth-api";
import { ApiError } from "@/lib/api-client";
import {
  getBillingCapabilities,
  type BillingCapabilities,
  type BillingFeature,
} from "@/lib/billing-api";
import {
  AUTH_SESSION_CHANGED_EVENT,
  AuthSession,
  clearAuthSession,
  createAuthSession,
  readAuthSession,
  saveAuthSession,
} from "@/lib/auth-session";
import {
  resolvePlanCapability,
  type PlanCapabilityView,
} from "@/lib/plan-capabilities";
import { Tenant, User, UserRole } from "@/types/saas-schema";

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  role: UserRole | null;
  loading: boolean;
  login: (
    credentials: LoginDto,
  ) => Promise<AuthSession | { requiresMfa: true }>;
  signOut: (redirectTo?: string) => void;
  synchronizeTenant: (tenant: Tenant) => boolean;
  planCapabilities: BillingCapabilities | null;
  planCapabilitiesLoading: boolean;
  planCapabilitiesError: string | null;
  refreshPlanCapabilities: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [planCapabilities, setPlanCapabilities] =
    useState<BillingCapabilities | null>(null);
  const [planCapabilitiesLoading, setPlanCapabilitiesLoading] = useState(false);
  const [planCapabilitiesError, setPlanCapabilitiesError] = useState<
    string | null
  >(null);
  const [planCapabilitiesRevision, setPlanCapabilitiesRevision] = useState(0);
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
    if (!session?.accessToken || session.user.mustChangePassword === true) {
      setPlanCapabilities(null);
      setPlanCapabilitiesError(null);
      setPlanCapabilitiesLoading(false);
      return;
    }

    const controller = new AbortController();
    setPlanCapabilities(null);
    setPlanCapabilitiesError(null);
    setPlanCapabilitiesLoading(true);

    void getBillingCapabilities(controller.signal)
      .then((capabilities) => {
        if (!controller.signal.aborted) {
          setPlanCapabilities(capabilities);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        if (error instanceof ApiError && error.status === 401) {
          return;
        }
        if (!controller.signal.aborted) {
          setPlanCapabilitiesError(
            error instanceof ApiError
              ? error.message
              : "No fue posible validar las funciones incluidas en tu plan.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPlanCapabilitiesLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    session?.accessToken,
    session?.user.mustChangePassword,
    planCapabilitiesRevision,
  ]);

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
      const response = await loginWithCredentials(credentials);
      if ("requiresMfa" in response) {
        return response;
      }
      saveAuthSession(response);
      setSession(response);
      return response;
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(
    (redirectTo?: string) => {
      void logoutAllSessions().catch(() => {
        // La salida local no depende de la red. El token remoto conserva su
        // expiración y cualquier revocación de seguridad ya aplicada.
      });
      clearAuthSession();
      setSession(null);
      setPlanCapabilities(null);
      setPlanCapabilitiesError(null);
      setPlanCapabilitiesLoading(false);
      if (redirectTo) {
        window.location.replace(redirectTo);
        return;
      }
      router.replace("/iniciar-sesion");
    },
    [router],
  );

  const synchronizeTenant = useCallback((updatedTenant: Tenant) => {
    const currentSession = readAuthSession();
    if (!currentSession || currentSession.tenant.id !== updatedTenant.id) {
      return false;
    }

    const nextSession: AuthSession = {
      ...currentSession,
      tenant: { ...currentSession.tenant, ...updatedTenant },
    };
    saveAuthSession(nextSession);
    setSession(nextSession);
    return true;
  }, []);

  const refreshPlanCapabilities = useCallback(() => {
    setPlanCapabilitiesRevision((revision) => revision + 1);
  }, []);

  const value: AuthContextType = {
    user: session?.user ?? null,
    tenant: session?.tenant ?? null,
    role: session?.user.role ?? null,
    loading,
    login,
    signOut,
    synchronizeTenant,
    planCapabilities,
    planCapabilitiesLoading,
    planCapabilitiesError,
    refreshPlanCapabilities,
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

export function usePlanCapability(
  feature: BillingFeature,
): PlanCapabilityView & { refresh: () => void } {
  const {
    planCapabilities,
    planCapabilitiesError,
    planCapabilitiesLoading,
    refreshPlanCapabilities,
  } = useAuth();

  return {
    ...resolvePlanCapability(
      feature,
      planCapabilities,
      planCapabilitiesLoading,
      planCapabilitiesError,
    ),
    refresh: refreshPlanCapabilities,
  };
}
