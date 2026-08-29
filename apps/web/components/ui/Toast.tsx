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
      className={cn(
        "flex items-center gap-3 bg-white border-l-4 p-4 rounded-xl shadow-2xl min-w-[300px] animate-in slide-in-from-right-full duration-300 mb-3",
        borders[type]
      )}
    >
      <div className="flex-shrink-0">
        {icons[type]}
      </div>
      <div className="flex-1">
        <p className="text-sm font-bold text-slate-800">{message}</p>
      </div>
      <button 
        onClick={() => onClose(id)}
        className="text-slate-400 hover:text-slate-600 transition-colors"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export const ToastContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="fixed top-6 right-6 z-[100] flex flex-col items-end pointer-events-none">
      <div className="pointer-events-auto">
        {children}
      </div>
    </div>
  );
};
