'use client';

import React, { useState } from 'react';
import { 
  User, 
  MapPin, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

const steps = [
  { id: 1, name: 'Personal', icon: User },
  { id: 2, name: 'Electoral', icon: MapPin },
  { id: 3, name: 'Compromiso', icon: ShieldCheck },
];

export default function NewVoterPage() {
  const [currentStep, setCurrentStep] = useState(1);

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, 3));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  return (
    <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="text-center space-y-4">
        <h1 className="text-4xl font-black text-secondary tracking-tighter">Asistente de Registro</h1>
        <p className="text-zinc-500 font-medium italic">Captura de nuevos votantes - Campaña 2026</p>
      </header>

      {/* Stepper */}
      <div className="flex items-center justify-between px-4">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-3 group">
              <div className={cn(
                "h-14 w-14 rounded-[1.25rem] flex items-center justify-center transition-all duration-300 border-2",
                currentStep >= step.id 
                  ? "bg-primary border-primary text-white shadow-xl shadow-primary/30" 
                  : "bg-white border-zinc-100 text-zinc-300"
              )}>
                <step.icon className="h-6 w-6" />
              </div>
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest",
                currentStep >= step.id ? "text-secondary" : "text-zinc-300"
              )}>
                {step.name}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-4 transition-colors duration-500",
                currentStep > step.id ? "bg-primary" : "bg-zinc-100"
              )} />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Form Content */}
      <div className="bg-white rounded-[2.5rem] border border-zinc-100 p-10 shadow-xl shadow-zinc-200/50">
        {currentStep === 1 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-secondary tracking-tight">Datos Personales</h2>
              <p className="text-sm text-zinc-400 font-medium italic">Información básica del ciudadano</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Nombre Completo</label>
                <input 
                  type="text" 
                  placeholder="Ej: Pedro Pérez"
                  className="w-full h-15 rounded-[1.25rem] bg-zinc-50 border-none px-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Cédula</label>
                <input 
                  type="text" 
                  placeholder="Número de documento"
                  className="w-full h-15 rounded-[1.25rem] bg-zinc-50 border-none px-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Teléfono</label>
                <input 
                  type="tel" 
                  placeholder="+57 300..."
                  className="w-full h-15 rounded-[1.25rem] bg-zinc-50 border-none px-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Email (Opcional)</label>
                <input 
                  type="email" 
                  placeholder="correo@ejemplo.com"
                  className="w-full h-15 rounded-[1.25rem] bg-zinc-50 border-none px-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-secondary tracking-tight">Ubicación Electoral</h2>
              <p className="text-sm text-zinc-400 font-medium italic">¿Dónde vota este ciudadano?</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Puesto de Votación</label>
                <input 
                  type="text" 
                  placeholder="Nombre de la Institución"
                  className="w-full h-15 rounded-[1.25rem] bg-zinc-50 border-none px-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <div className="space-y-3">
                <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Mesa</label>
                <input 
                  type="text" 
                  placeholder="Ej: 14"
                  className="w-full h-15 rounded-[1.25rem] bg-zinc-50 border-none px-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
              <div className="md:col-span-2 space-y-3">
                <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Comuna / Localidad</label>
                <input 
                  type="text" 
                  placeholder="Zona geográfica"
                  className="w-full h-15 rounded-[1.25rem] bg-zinc-50 border-none px-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-secondary tracking-tight">Compromiso y Cierre</h2>
              <p className="text-sm text-zinc-400 font-medium italic">Verificación final de datos</p>
            </div>
            
            <div className="bg-emerald-50 p-8 rounded-[1.5rem] border border-emerald-100 flex gap-6 items-start">
              <div className="h-10 w-10 rounded-full bg-emerald-500 text-white flex-shrink-0 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-2">
                <p className="text-sm font-black text-emerald-900 uppercase tracking-widest">Compromiso Verificado</p>
                <p className="text-xs text-emerald-700 font-medium leading-relaxed">
                  Al registrar este votante, aseguras que se ha verificado su intención de apoyo y su correcta inscripción en el censo electoral.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="ml-2 text-[10px] font-black uppercase tracking-widest text-zinc-400">Observaciones</label>
              <textarea 
                rows={4}
                placeholder="Notas adicionales..."
                className="w-full rounded-[1.25rem] bg-zinc-50 border-none p-6 text-sm font-bold focus:ring-2 focus:ring-primary transition-all"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-12 flex items-center justify-between gap-4">
          <button 
            onClick={prevStep}
            disabled={currentStep === 1}
            className={cn(
              "flex items-center gap-2 px-8 py-4 rounded-[1.25rem] font-black text-xs uppercase tracking-widest transition-all",
              currentStep === 1 ? "opacity-0 cursor-default" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>

          <button 
            onClick={currentStep === 3 ? () => {} : nextStep}
            className="flex items-center gap-2 px-10 py-4 rounded-[1.25rem] bg-primary text-white font-black text-xs uppercase tracking-widest hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
          >
            {currentStep === 3 ? (
              <div className="flex items-center gap-2">
                <span>Finalizar Registro</span>
                <CheckCircle2 className="h-4 w-4" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span>Continuar</span>
                <ArrowRight className="h-4 w-4" />
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
