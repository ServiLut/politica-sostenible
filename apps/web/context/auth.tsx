"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { UserRole, User, Tenant } from "../types/saas-schema";
import { useRouter } from "next/navigation";
import { AUTH_TOKEN_KEY } from "@/lib/auth-token";
import { AppPermission, hasPermission } from "@/lib/permissions";

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  role: UserRole | null;
  loading: boolean;
  can: (permission: AppPermission) => boolean;
  loginAs: (role: UserRole) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const mapBackendRoleToUiRole = (role: string): UserRole => {
    switch (role) {
      case "ADMIN":
        return UserRole.AdminCampana;
      case "CAMPAIGN_MANAGER":
        return UserRole.GerenteOps;
      case "ZONE_COORDINATOR":
        return UserRole.Coordinador;
      case "WITNESS":
        return UserRole.Testigo;
      case "VOLUNTEER":
      default:
        return UserRole.Voluntario;
    }
  };

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem(AUTH_TOKEN_KEY);
      if (!token) {
        setUser(null);
        setTenant(null);
        setLoading(false);
        return;
      }

      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setUser(null);
          setTenant(null);
          setLoading(false);
          return;
        }

        const payload = await response.json();
        const data = payload?.data ?? payload;
        const apiUser = data?.user;
        const apiTenant = data?.tenant;

        if (!apiUser) {
          localStorage.removeItem(AUTH_TOKEN_KEY);
          setUser(null);
          setTenant(null);
          return;
        }

        setUser({
          id: apiUser.id,
          email: apiUser.email,
          name: apiUser.name,
          role: mapBackendRoleToUiRole(apiUser.role),
        });

        if (apiTenant) {
          setTenant({
            id: apiTenant.id,
            name: apiTenant.name,
            subdomain: apiTenant.slug || "",
            plan: "enterprise",
          });
        } else {
          setTenant(null);
        }
      } catch (err) {
        console.error("Critical error in fetchUser:", err);
        localStorage.removeItem(AUTH_TOKEN_KEY);
        setUser(null);
        setTenant(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  useEffect(() => {
    // Auto-redirect if already logged in and at root or login page
    if (user && !loading && typeof window !== 'undefined') {
      if (window.location.pathname === '/' || window.location.pathname === '/iniciar-sesion') {
        router.replace('/dashboard/executive');
      }
    }
  }, [user, loading, router]);

  const loginAs = async (role: UserRole) => {
    console.warn(`Role switch disabled in production mode. Requested role: ${role}`);
    router.push('/iniciar-sesion');
  };

  const signOut = async () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setUser(null);
    setTenant(null);
    router.push('/');
  };

  const value = {
    user,
    tenant,
    role: user?.role || null,
    loading,
    can: (permission: AppPermission) => hasPermission(user?.role || null, permission),
    loginAs,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

