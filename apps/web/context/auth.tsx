"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import {
  getCurrentAuthUser,
  loginWithCredentials,
  LoginDto,
  logoutAllSessions,
} from "@/lib/auth-api";
import { createSessionStore } from "./session-store";
import { usePageRequest } from "@/lib/use-page-request";
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

const sessionStore = createSessionStore<AuthSession>(readAuthSession, (onChange) => {
  window.addEventListener(AUTH_SESSION_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(AUTH_SESSION_CHANGED_EVENT, onChange);
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.getSnapshot, sessionStore.getServerSnapshot);
  const [validatedToken, setValidatedToken] = useState<string | null>(null);
  const [loginLoading, setLoading] = useState(false);
  const [planCapabilitiesRevision, setPlanCapabilitiesRevision] = useState(0);
  const router = useRouter();
  const accessToken = session?.accessToken;
  const loading = session === undefined || loginLoading || Boolean(accessToken && validatedToken !== accessToken);

  useEffect(() => {
    const storedSession = readAuthSession();
    if (!accessToken || storedSession?.accessToken !== accessToken) return;
    const controller = new AbortController();
    void getCurrentAuthUser(controller.signal)
      .then((currentUser) => {
        if (controller.signal.aborted || readAuthSession()?.accessToken !== storedSession.accessToken) return;
        saveAuthSession(createAuthSession(storedSession.accessToken, currentUser));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || readAuthSession()?.accessToken !== storedSession.accessToken) return;
        if (error instanceof ApiError && error.status === 401) clearAuthSession();
        // Every API operation still verifies the current role and account state.
      })
      .finally(() => {
        if (!controller.signal.aborted) setValidatedToken(storedSession.accessToken);
      });
    return () => controller.abort();
  }, [accessToken]);

  const capabilitiesEnabled = Boolean(session?.accessToken && session.user.mustChangePassword !== true);
  const {
    data: planCapabilities,
    loading: planCapabilitiesLoading,
    error: capabilitiesError,
  } = usePageRequest<BillingCapabilities>(getBillingCapabilities, {
    enabled: capabilitiesEnabled,
    reloadKey: `${accessToken}:${session?.user.mustChangePassword}:${planCapabilitiesRevision}`,
  });
  const planCapabilitiesError = capabilitiesError
    ? capabilitiesError instanceof ApiError
      ? capabilitiesError.message
      : "No fue posible validar las funciones incluidas en tu plan."
    : null;

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
