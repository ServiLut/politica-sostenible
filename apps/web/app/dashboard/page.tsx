"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth";
import { getDefaultDashboardRoute } from "@/config/navigation";

/**
 * /dashboard is only an entry point. The target is always determined by the
 * authenticated tenant and role; it must not fall back to a campaign screen.
 */
export default function DashboardPage() {
  const router = useRouter();
  const { tenant, user, loading } = useAuth();
  const stage = tenant?.operationStage;

  useEffect(() => {
    if (loading || !user || !tenant) return;
    router.replace(getDefaultDashboardRoute(user, tenant, stage));
  }, [loading, router, stage, tenant, user]);

  return (
    <div
      role="status"
      aria-label="Abriendo el panel disponible"
      className="flex h-full min-h-64 items-center justify-center"
    >
      <div
        aria-hidden="true"
        className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 motion-reduce:animate-none"
      />
    </div>
  );
}
