"use client";

import React from 'react';
import { CheckCircle, AlertTriangle, XOctagon, X, Info } from 'lucide-react';
import { cn } from './utils';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  id: string;
  message: string;
  type: ToastType;
  onClose: (id: string) => void;
}

const icons = {
  success: <CheckCircle className="text-emerald-500" size={18} />,
  error: <XOctagon className="text-red-500" size={18} />,
  info: <Info className="text-blue-500" size={18} />,
  warning: <AlertTriangle className="text-amber-500" size={18} />,
};

const borders = {
  success: "border-l-emerald-500",
  error: "border-l-red-500",
  info: "border-l-blue-500",
  warning: "border-l-amber-500",
};

export const Toast = ({ id, message, type, onClose }: ToastProps) => {
  return (
    <div
      role={type === 'error' || type === 'warning' ? 'alert' : 'status'}
      aria-atomic="true"
      className={cn(
        "pointer-events-auto flex w-full min-w-0 items-start gap-3 rounded-xl border border-slate-200 border-l-4 bg-white p-3 shadow-lg sm:p-4",
        borders[type]
      )}
    >
      <div aria-hidden="true" className="mt-3 shrink-0">
        {icons[type]}
      </div>
      <div className="min-w-0 flex-1 py-2.5">
        <p className="break-words text-sm font-medium leading-6 text-slate-800 [overflow-wrap:anywhere]">{message}</p>
      </div>
      <button
        type="button"
        onClick={() => onClose(id)}
        aria-label="Cerrar notificación"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-ring"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export const ToastContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(var(--app-banner-height)+0.75rem+env(safe-area-inset-top))] z-[200] flex max-h-[calc(100dvh-2rem)] flex-col gap-2 overflow-y-auto overscroll-contain sm:left-auto sm:right-6 sm:w-96">
      {children}
    </div>
  );
};
