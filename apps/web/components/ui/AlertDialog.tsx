"use client";

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info' | 'warning';
}

export const AlertDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Confirmar Acción",
  cancelText = "Cancelar",
  variant = 'danger'
}: AlertDialogProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="p-8 text-center">
          <div className={
            `w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
              variant === 'danger' ? 'bg-red-50 text-red-500' : 
              variant === 'warning' ? 'bg-amber-50 text-amber-500' :
              'bg-blue-50 text-blue-500'
            }`
          }>
            <AlertTriangle size={32} />
          </div>
          
          <h3 className="text-2xl font-black text-slate-900 tracking-tighter mb-2">
            {title}
          </h3>
          <p className="text-slate-500 text-sm font-medium leading-relaxed mb-8">
            {description}
          </p>
          
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className={
                `w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${
                  variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700 shadow-red-200' : 
                  variant === 'warning' ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-200' :
                  'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
                }`
              }
            >
              {confirmText}
            </button>
            <button
              onClick={onClose}
              className="w-full py-4 rounded-2xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 transition-all"
            >
              {cancelText}
            </button>
          </div>
        </div>
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
};
