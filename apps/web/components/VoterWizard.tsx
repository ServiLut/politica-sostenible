'use client';

import React, { useState } from 'react';
import { Camera, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export const VoterWizard = () => {
  const [step, setStep] = useState(1);
  const [data, setData] = useState({
    cedula: '1.020.304.050',
    name: 'Marta Lucía Ramírez',
    concern: '',
  });

  const nextStep = () => setStep((s) => s + 1);

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-xl border border-blue-50">
      {/* Progress Bar */}
      <div className="mb-8 flex justify-between gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 flex-1 rounded-full transition-all duration-500 ${
              s <= step ? 'bg-blue-600' : 'bg-gray-100'
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="text-center animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Escanea la Cédula</h2>
          <p className="text-gray-500 mb-6">Apunta la cámara al reverso del documento</p>
          
          <div 
            onClick={nextStep}
            className="aspect-[1.586/1] bg-slate-900 rounded-xl flex flex-col items-center justify-center border-4 border-blue-100 mb-6 cursor-pointer group hover:border-blue-300 transition-all"
          >
            <Camera className="w-16 h-16 text-white mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-blue-200 text-sm font-medium">Tocar para capturar</p>
          </div>
          
          <Button onClick={nextStep} variant="outline" className="w-full">
            Ingresar manualmente
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Verifica la Información</h2>
          <div className="space-y-4 mb-8">
            <div className="space-y-2">
              <Label htmlFor="cedula">Número de Identidad</Label>
              <Input id="cedula" value={data.cedula} readOnly className="bg-gray-50 font-mono text-lg" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre Completo</Label>
              <Input id="name" value={data.name} readOnly className="bg-gray-50" />
            </div>
          </div>
          <Button onClick={nextStep} className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-lg">
            Es Correcto, Continuar
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="text-center animate-in zoom-in-95">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">¿Qué te preocupa?</h2>
          <p className="text-gray-500 mb-6">Selecciona el tema prioritario para tu zona</p>
          
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { id: 'sec', label: 'Seguridad', icon: '🛡️' },
              { id: 'health', label: 'Salud', icon: '🏥' },
              { id: 'job', label: 'Empleo', icon: '💼' },
              { id: 'edu', label: 'Educación', icon: '🎓' },
            ].map((topic) => (
              <button
                key={topic.id}
                onClick={() => setData({ ...data, concern: topic.id })}
                className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                  data.concern === topic.id 
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200' 
                    : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                }`}
              >
                <span className="text-3xl">{topic.icon}</span>
                <span className="text-xs font-bold uppercase tracking-wider">{topic.label}</span>
              </button>
            ))}
          </div>
          
          <Button 
            disabled={!data.concern}
            onClick={() => alert('Votante registrado con éxito 🎉')} 
            className="w-full bg-green-600 hover:bg-green-700 h-12 text-lg font-bold"
          >
            Registrar Votante
          </Button>
        </div>
      )}
    </div>
  );
};
