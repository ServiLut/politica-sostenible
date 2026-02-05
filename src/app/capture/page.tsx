'use client';

import CaptureForm from '@/components/CaptureForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CapturePage() {
  return (
    <div className="min-h-screen bg-slate-100 p-4 flex flex-col items-center">
      <div className="w-full max-w-md mb-4 flex items-center">
        <Link href="/dashboard" className="p-2 bg-white rounded-full shadow-sm text-slate-600 hover:text-slate-900">
            <ArrowLeft className="w-6 h-6" />
        </Link>
        <span className="ml-4 font-bold text-slate-500">Volver al Tablero</span>
      </div>
      
      <CaptureForm />

      <div className="mt-8 text-center text-slate-400 text-xs max-w-xs">
        <p>Los datos recolectados están protegidos por encriptación AES-256 en reposo.</p>
        <p className="mt-2">CRM V4.2 • Módulo de Terreno</p>
      </div>
    </div>
  );
}
