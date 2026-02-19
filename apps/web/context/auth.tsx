"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { UserRole, User, Tenant } from "../types/saas-schema";
import { useRouter } from "next/navigation";

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  role: UserRole | null;
  loading: boolean;
  loginAs: (role: UserRole) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_TENANT: Tenant = {
  id: 'tenant-1',
  name: 'Campaña Presidencial 2026',
  subdomain: 'campana2026',
  plan: 'enterprise',
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window !== 'undefined') {
      const savedRole = localStorage.getItem('dev_role') as UserRole;
      if (savedRole) {
        return {
          id: `user-${savedRole}`,
          email: `${savedRole.toLowerCase()}@campana.com`,
          name: `Usuario ${savedRole}`,
          role: savedRole,
        };
      }
    }
    return null;
  });

  const [tenant, setTenant] = useState<Tenant | null>(() => {
    if (typeof window !== 'undefined' && localStorage.getItem('dev_role')) {
      return MOCK_TENANT;
    }
    return null;
  });

  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const simulateLogin = (role: UserRole) => {
    const mockUser: User = {
      id: `user-${role}`,
      email: `${role.toLowerCase()}@campana.com`,
      name: `Usuario ${role}`,
      role: role,
    };
    setUser(mockUser);
    setTenant(MOCK_TENANT);
    localStorage.setItem('dev_role', role);
  };

  useEffect(() => {
    // Auto-redirect if already logged in and at root
    if (user && typeof window !== 'undefined' && window.location.pathname === '/') {
      router.replace('/dashboard/executive');
    }
  }, [user, router]);

  const loginAs = (role: UserRole) => {
    setLoading(true);
    simulateLogin(role);
    setLoading(false);
    router.push('/dashboard/executive');
  };

  const signOut = () => {
    setUser(null);
    setTenant(null);
    localStorage.removeItem('dev_role');
    router.push('/');
  };

  const value = {
    user,
    tenant,
    role: user?.role || null,
    loading,
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
