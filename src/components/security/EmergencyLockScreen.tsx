'use client';

import React, { useState, useEffect } from 'react';
import { Shield, Lock } from 'lucide-react';
import { toggleSystemLock } from '@/app/actions/security';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function EmergencyLockScreen() {
    const router = useRouter();
    const [unlockPin, setUnlockPin] = useState('');
    const [unlocking, setUnlocking] = useState(false);
    const [incidentId, setIncidentId] = useState('');

    useEffect(() => {
        setIncidentId(Date.now().toString().substring(6));
    }, []);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setUnlocking(true);
        try {
            const res = await toggleSystemLock(false, unlockPin);
            if (res.success) {
                toast.success('SISTEMA RESTAURADO', { description: 'Operaciones normales reanudadas.' });
                setUnlockPin('');
                router.refresh(); // Refresh to remove lock screen from layout
            }
        } catch (e: any) {
            toast.error('FALLO DE AUTENTICACIÓN', { description: e.message });
            setUnlockPin('');
        } finally {
            setUnlocking(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-red-600 flex flex-col items-center justify-center p-8 text-white animate-in zoom-in duration-300">
            <div className="max-w-md w-full bg-red-700/50 backdrop-blur-xl border border-red-500 p-10 rounded-3xl shadow-2xl text-center space-y-8">
                <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto shadow-xl animate-pulse">
                    <Lock className="w-16 h-16 text-red-600" />
                </div>
                
                <div className="space-y-2">
                    <h1 className="text-2xl font-black uppercase tracking-widest">Sistema Bajo Protocolo de Emergencia</h1>
                    <p className="text-red-100 font-medium text-sm">Todas las operaciones están suspendidas para proteger la integridad de los datos.</p>
                </div>

                <form onSubmit={handleUnlock} className="space-y-6 pt-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-red-200">Pin de Administrador</label>
                        <input 
                            type="password" 
                            maxLength={4}
                            className="w-full text-center text-4xl font-black tracking-[1em] bg-red-900/50 border-2 border-red-400 rounded-xl p-4 outline-none focus:border-white focus:bg-red-900 transition-all placeholder-red-800/50 text-white"
                            placeholder="••••"
                            value={unlockPin}
                            onChange={e => setUnlockPin(e.target.value)}
                            autoFocus
                        />
                    </div>
                    
                    <button 
                        type="submit" 
                        disabled={unlocking || unlockPin.length < 4}
                        className="w-full bg-white text-red-600 font-black uppercase tracking-widest py-4 rounded-xl shadow-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                    >
                        {unlocking ? 'Verificando...' : (
                            <>
                                <Shield className="w-5 h-5" />
                                Restaurar Sistema
                            </>
                        )}
                    </button>
                </form>

                <div className="text-[10px] uppercase tracking-widest text-red-300/60 font-black">
                    ID Incidente: {incidentId}
                </div>
            </div>
        </div>
    );
}
