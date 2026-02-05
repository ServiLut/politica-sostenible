'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, ShieldCheck, ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { requestRecovery, resetPinWithCode } from '@/app/actions/auth';

export default function RecoveryPage() {
  const router = useRouter();
  const [step, setStep] = useState(1); // 1: Email, 2: Code & New PIN
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [recoveredUser, setRecoveredUser] = useState('');

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await requestRecovery(email);
      if (res.success) {
        toast.success('Código Enviado', { description: 'Revisa tu bandeja de entrada.' });
        setStep(2);
      } else {
        toast.error('Error', { description: res.error });
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length !== 4) {
        toast.warning('PIN Inválido', { description: 'El nuevo PIN debe ser de 4 dígitos.' });
        return;
    }
    setLoading(true);
    try {
      const res = await resetPinWithCode(email, code, newPin);
      if (res.success) {
        setRecoveredUser(res.fullName || '');
        setStep(3); // Success Screen
        toast.success('PIN Actualizado');
      } else {
        toast.error('Error', { description: res.error });
      }
    } catch (err) {
      toast.error('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-gray-50 flex items-center justify-center p-6 font-sans">
      <div className="max-w-[450px] w-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        
        {/* LOGO */}
        <div className="flex flex-col items-center text-center">
            <Link href="/login" className="w-16 h-16 bg-brand-black rounded-3xl flex items-center justify-center shadow-xl mb-4 hover:scale-105 transition-transform">
                <ShieldCheck className="w-8 h-8 text-brand-green-500" />
            </Link>
            <h1 className="text-2xl font-black text-brand-black tracking-tight uppercase">Recuperación de Cuenta</h1>
        </div>

        <div className="card-friendly p-10 bg-white relative overflow-hidden">
          
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="mb-8">
                    <h2 className="text-lg font-black text-brand-black">Paso 1: Identificación</h2>
                    <p className="text-xs text-brand-gray-400 font-bold mt-1 uppercase tracking-widest">Ingrese su correo electrónico vinculado</p>
                </div>

                <form onSubmit={handleRequestCode} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">Correo Electrónico</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                                <Mail className="h-5 w-5 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" />
                            </div>
                            <input 
                                type="email" 
                                required 
                                className="block w-full pl-14 pr-5 py-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white text-brand-black font-bold outline-none transition-all" 
                                placeholder="usuario@ejemplo.com" 
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="btn-primary-friendly w-full py-4 flex items-center justify-center gap-2 shadow-lg">
                        {loading ? 'Procesando...' : <><Send className="w-4 h-4" /> Enviar Código</>}
                    </button>
                    
                    <Link href="/login" className="flex items-center justify-center gap-2 text-[10px] font-black text-brand-gray-400 uppercase tracking-widest hover:text-brand-black transition-colors pt-2">
                        <ArrowLeft className="w-3 h-3" /> Volver al Login
                    </Link>
                </form>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="mb-8">
                    <h2 className="text-lg font-black text-brand-black">Paso 2: Verificación</h2>
                    <p className="text-xs text-brand-gray-400 font-bold mt-1 uppercase tracking-widest">Ingrese el código enviado a {email}</p>
                </div>

                <form onSubmit={handleResetPin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">Código de Verificación</label>
                        <input 
                            type="text" 
                            required 
                            className="block w-full p-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white text-brand-black font-black text-center text-2xl tracking-[0.5em] outline-none transition-all" 
                            placeholder="000000" 
                            value={code} 
                            onChange={(e) => setCode(e.target.value)} 
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-brand-gray-500 uppercase tracking-widest ml-1">Nuevo PIN (4 dígitos)</label>
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                                <Lock className="h-5 w-5 text-brand-gray-300 group-focus-within:text-brand-black transition-colors" />
                            </div>
                            <input 
                                type="password" 
                                maxLength={4}
                                required 
                                className="block w-full pl-14 pr-5 py-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white text-brand-black font-black text-2xl tracking-[0.6em] outline-none transition-all" 
                                placeholder="••••" 
                                value={newPin} 
                                onChange={(e) => setNewPin(e.target.value.replace(/\D/g,''))} 
                            />
                        </div>
                    </div>

                    <button type="submit" disabled={loading} className="btn-primary-friendly w-full py-4 flex items-center justify-center gap-2 shadow-lg">
                        {loading ? 'Validando...' : 'Restablecer Cuenta'}
                    </button>
                    
                    <button type="button" onClick={() => setStep(1)} className="w-full text-[10px] font-black text-brand-gray-400 uppercase tracking-widest hover:text-brand-black transition-colors pt-2">
                        Cambiar Correo Electrónico
                    </button>
                </form>
            </div>
          )}

          {step === 3 && (
            <div className="animate-in zoom-in-95 duration-500 text-center py-4">
                <div className="w-20 h-20 bg-brand-green-100 text-brand-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                    <CheckCircle2 className="w-10 h-10" />
                </div>
                <h2 className="text-2xl font-black text-brand-black mb-2">¡Cuenta Recuperada!</h2>
                <p className="text-brand-gray-500 font-medium mb-8">
                    Tu PIN ha sido actualizado con éxito.
                </p>

                <div className="bg-brand-gray-50 p-6 rounded-2xl border border-brand-gray-100 mb-8">
                    <p className="text-[10px] font-black text-brand-gray-400 uppercase tracking-widest mb-2">Tu Usuario es:</p>
                    <p className="text-xl font-black text-brand-black">{recoveredUser}</p>
                </div>

                <Link href="/login" className="btn-primary-friendly w-full py-4 inline-flex items-center justify-center gap-2 shadow-xl">
                    Ir al Login de Usuario
                </Link>
            </div>
          )}

        </div>
        
        <p className="text-center text-[10px] text-brand-gray-400 font-bold uppercase tracking-widest leading-relaxed">
            Si no tiene un correo vinculado, <br/> debe contactar a soporte técnico central.
        </p>
      </div>
    </div>
  );
}
