"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/dashboard/executive');
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-pulse text-slate-400 font-medium">Redirigiendo al Centro de Comando...</div>
    </div>
  );
}
