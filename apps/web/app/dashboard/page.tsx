"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api-client';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const checkBriefing = async () => {
      try {
        const data: any = await apiRequest('/command-center/briefing');
        if (data?.activation?.completedSteps === 0) {
          setShowOnboarding(true);
        } else {
          router.push('/dashboard/executive');
        }
      } catch (error) {
        // Safe fallback
        router.push('/dashboard/executive');
      } finally {
        setLoading(false);
      }
    };

    checkBriefing();
  }, [router]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Abriendo el panel disponible"
        className="flex h-full min-h-64 items-center justify-center"
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            aria-hidden="true"
            className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600 motion-reduce:animate-none"
          />
          <p className="text-sm font-semibold text-slate-500">
            Abriendo tu espacio de trabajo…
          </p>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return <OnboardingWizard onComplete={() => router.push('/dashboard/executive')} />;
  }

  return null;
}
