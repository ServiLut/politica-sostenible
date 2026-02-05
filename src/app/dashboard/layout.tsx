import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { getGlobalLockStatus } from '@/lib/security-guard';
import EmergencyLockScreen from '@/components/security/EmergencyLockScreen';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isLocked = await getGlobalLockStatus();

  if (isLocked) {
      return <EmergencyLockScreen />;
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      
      <main className="flex-1 md:ml-64 p-8 transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
