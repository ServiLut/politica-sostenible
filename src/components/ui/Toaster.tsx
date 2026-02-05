'use client';

import { Toaster as SonnerToaster } from 'sonner';

export default function Toaster() {
  return (
    <SonnerToaster 
        position="top-right" 
        expand={true} 
        richColors 
        theme="light"
        closeButton
        style={{ fontFamily: 'var(--font-inter)' }}
        toastOptions={{
            classNames: {
                toast: 'bg-white border-2 border-brand-gray-100 shadow-xl rounded-2xl p-4',
                title: 'text-brand-black font-black text-sm uppercase tracking-wider',
                description: 'text-brand-gray-500 font-bold text-xs mt-1',
                actionButton: 'bg-brand-black text-white font-black text-xs px-3 py-2 rounded-lg',
                cancelButton: 'bg-brand-gray-100 text-brand-gray-500 font-bold text-xs px-3 py-2 rounded-lg',
                error: 'bg-red-50 border-red-100 text-red-700',
                success: 'bg-brand-green-50 border-brand-green-100 text-brand-green-700',
                warning: 'bg-amber-50 border-amber-100 text-amber-700',
                info: 'bg-blue-50 border-blue-100 text-blue-700',
            }
        }}
    />
  );
}
