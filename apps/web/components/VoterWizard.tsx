'use client';

import React, { useState } from 'react';
import { Camera, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCRM } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';

export const VoterWizard = () => {
  const { addContact } = useCRM();
  const { success, error } = useToast();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [data, setData] = useState({
    cedula: '',
    name: '',
    phone: '',
    neighborhood: '',
    concern: '',
  });

  const nextStep = () => setStep((s) => s + 1);
  const prevStep = () => setStep((s) => s - 1);

  const handleRegister = async () => {
    setIsSubmitting(true);
    try {
      await addContact({
        name: data.name,
        cedula: data.cedula,
        phone: data.phone,
        neighborhood: data.neighborhood,
        role: 'Simpatizante',
        stage: 'Prospecto',
        address: ''
      });
      success('Votante registrado con éxito en la base de datos.');
      setStep(4); // Success step
    } catch {
      error('Error al registrar el votante. Por favor intente de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl shadow-xl border border-blue-50">
      {/* Progress Bar */}
      {step < 4 && (
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
      )}

      {step === 1 && (
        <div className="text-center animate-in fade-in slide-in-from-bottom-4">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">Escanea la Cédula</h2>
          <p className="text-gray-500 mb-6">Apunta la cámara al reverso del documento</p>
          
          <div className="aspect-[1.586/1] bg-slate-900 rounded-xl flex flex-col items-center justify-center border-4 border-blue-100 mb-6 group">
            <Camera className="w-16 h-16 text-white mb-2 group-hover:scale-110 transition-transform" />
            <p className="text-blue-200 text-sm font-medium">Escáner OCR en despliegue</p>
          </div>
          
          <div className="space-y-4">
            <div className="text-left space-y-2">
              <Label htmlFor="manual-cedula">O ingresa la Cédula</Label>
              <Input 
                id="manual-cedula" 
                placeholder="CC 12345678" 
                value={data.cedula}
                onChange={(e) => setData({ ...data, cedula: e.target.value })}
              />
            </div>
            <Button 
              onClick={nextStep} 
              disabled={!data.cedula}
              variant="outline" 
              className="w-full"
            >
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="animate-in fade-in slide-in-from-right-4">
          <h2 className="text-2xl font-bold mb-6 text-gray-800 text-center">Información del Ciudadano</h2>
          <div className="space-y-4 mb-8">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre Completo</Label>
              <Input 
                id="name" 
                value={data.name} 
                onChange={(e) => setData({ ...data, name: e.target.value })}
                placeholder="Ej: Juan Perez"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono / WhatsApp</Label>
              <Input 
                id="phone" 
                value={data.phone} 
                onChange={(e) => setData({ ...data, phone: e.target.value })}
                placeholder="300 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="neighborhood">Barrio / Comuna</Label>
              <Input 
                id="neighborhood" 
                value={data.neighborhood} 
                onChange={(e) => setData({ ...data, neighborhood: e.target.value })}
                placeholder="Ej: Belén, Medellín"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={prevStep} variant="ghost" className="flex-1">Atrás</Button>
            <Button 
              onClick={nextStep} 
              disabled={!data.name || !data.phone}
              className="flex-[2] bg-blue-600 hover:bg-blue-700"
            >
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center animate-in zoom-in-95">
          <h2 className="text-2xl font-bold mb-2 text-gray-800">¿Qué le preocupa?</h2>
          <p className="text-gray-500 mb-6">Selecciona el tema prioritario para su zona</p>
          
          <div className="grid grid-cols-2 gap-3 mb-8">
            {[
              { id: 'Seguridad', label: 'Seguridad', icon: '🛡️' },
              { id: 'Salud', label: 'Salud', icon: '🏥' },
              { id: 'Empleo', label: 'Empleo', icon: '💼' },
              { id: 'Educación', label: 'Educación', icon: '🎓' },
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
          
          <div className="flex gap-3">
            <Button onClick={prevStep} variant="ghost" className="flex-1">Atrás</Button>
            <Button 
              disabled={!data.concern || isSubmitting}
              onClick={handleRegister} 
              className="flex-[2] bg-green-600 hover:bg-green-700 font-bold"
            >
              {isSubmitting ? 'Registrando...' : 'Finalizar Registro'}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="text-center animate-in zoom-in-95 py-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2 text-gray-800">¡Registro Exitoso!</h2>
          <p className="text-gray-500 mb-8">El ciudadano ha sido vinculado a la plataforma de inteligencia electoral.</p>
          <Button 
            onClick={() => {
              setData({ cedula: '', name: '', phone: '', neighborhood: '', concern: '' });
              setStep(1);
            }} 
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            Registrar otro Votante
          </Button>
        </div>
      )}
    </div>
  );
};

