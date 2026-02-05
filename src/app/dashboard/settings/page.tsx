'use client';

import React, { useState, useEffect } from 'react';
import { DollarSign, Save, ShieldAlert, Settings, MapPin, Globe, Lock, FileText, AlertCircle, Vote } from 'lucide-react';
import TerritoryConfigPage from './territory/page';
import ElectionManager from './elections/page';

import { toast } from 'sonner';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'general' | 'territory' | 'elections'>('general');
  const [budget, setBudget] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentBudget, setCurrentBudget] = useState('0');

  useEffect(() => {
    fetch('/api/dashboard/stats').then(r => r.json()).then(data => {
        if (data.budget) {
            const parts = data.budget.toString().split(' / ');
            setCurrentBudget(parts[1] || '0');
            setBudget(parts[1] || '0');
        }
    });
  }, []);

  const handleUpdateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
        const res = await fetch('/api/settings/budget', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: budget })
        });
        if (res.ok) {
            toast.success('Meta Actualizada', { description: 'El nuevo techo presupuestal está activo.' });
            setCurrentBudget(budget);
        } else {
            toast.error('Error de Actualización');
        }
    } catch (e) { 
        toast.error('Fallo de Conexión');
    }
    setLoading(false);
  };

  const handleCloseElection = async () => {
      const pin = prompt('⚠️ PELIGRO: ESTA ACCIÓN ES IRREVERSIBLE.\n\nPara CERRAR LA ELECCIÓN y bloquear la base de datos, ingrese su PIN de Administrador:');
      if (!pin) return;

      toast('¿Ejecutar Cierre Definitivo?', {
          description: 'Esta acción bloqueará la base de datos permanentemente.',
          action: {
              label: 'CERRAR AHORA',
              onClick: async () => {
                  try {
                      setLoading(true);
                      const res = await fetch('/api/election/close', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pin })
                      });
                      const data = await res.json();
                      if (res.ok) {
                          toast.success('ELECCIÓN CERRADA', { description: 'Sistema blindado en modo lectura.' });
                          setTimeout(() => window.location.reload(), 2000);
                      } else {
                          toast.error('Cierre Fallido', { description: data.error });
                      }
                  } catch (e) {
                      toast.error('Error de Comunicación');
                  } finally {
                      setLoading(false);
                  }
              }
          }
      });
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
      <div>
          <h1 className="text-3xl font-black text-brand-black tracking-tight">Configuración del Sistema</h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-widest mt-1">Administración centralizada de parámetros</p>
      </div>

      {/* TABS NAVIGATION */}
      <div className="flex gap-4 border-b border-brand-gray-200 overflow-x-auto">
          <button 
            onClick={() => setActiveTab('general')}
            className={`pb-4 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-4 flex-shrink-0
                ${activeTab === 'general' ? 'border-brand-black text-brand-black' : 'border-transparent text-brand-gray-400 hover:text-brand-gray-600'}
            `}
          >
              <div className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  General & Finanzas
              </div>
          </button>
          <button 
            onClick={() => setActiveTab('territory')}
            className={`pb-4 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-4 flex-shrink-0
                ${activeTab === 'territory' ? 'border-brand-black text-brand-black' : 'border-transparent text-brand-gray-400 hover:text-brand-gray-600'}
            `}
          >
              <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Arquitectura Territorial
              </div>
          </button>
          <button 
            onClick={() => setActiveTab('elections')}
            className={`pb-4 px-4 text-xs font-black uppercase tracking-widest transition-all border-b-4 flex-shrink-0
                ${activeTab === 'elections' ? 'border-brand-black text-brand-black' : 'border-transparent text-brand-gray-400 hover:text-brand-gray-600'}
            `}
          >
              <div className="flex items-center gap-2">
                  <Vote className="w-4 h-4" />
                  Elecciones
              </div>
          </button>
      </div>

      {/* TAB CONTENT: GENERAL */}
      {activeTab === 'general' && (
          <div className="animate-in slide-in-from-left-4 duration-300 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* BUDGET CARD */}
                <div className="card-friendly p-10 bg-white">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-brand-green-100 text-brand-green-700 rounded-2xl shadow-inner">
                            <DollarSign className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-brand-black">Techo Presupuestal</h3>
                            <p className="text-xs text-brand-gray-400 font-bold uppercase tracking-widest">Control de ejecución financiera</p>
                        </div>
                    </div>
                    
                    <form onSubmit={handleUpdateBudget} className="flex flex-col gap-6">
                        <div className="flex-1 w-full">
                            <label className="block text-[10px] font-black text-brand-gray-400 uppercase tracking-widest mb-2 ml-1">Presupuesto Total (COP)</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-brand-gray-300 font-black text-xl">$</span>
                                <input type="number" className="w-full pl-10 p-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl font-black text-xl text-brand-black focus:border-brand-black focus:bg-white outline-none transition-all" value={budget} onChange={e => setBudget(e.target.value)} />
                            </div>
                        </div>
                        <button type="submit" disabled={loading} className="btn-primary-friendly w-full h-[60px] px-8 uppercase tracking-widest text-xs shadow-xl shadow-brand-black/10">
                            {loading ? 'Sincronizando...' : 'Actualizar Meta'}
                        </button>
                    </form>
                    
                    <div className="mt-8 pt-6 border-t border-brand-gray-100 flex items-center justify-between">
                        <span className="text-[10px] font-black text-brand-gray-400 uppercase">Estado Actual</span>
                        <span className="text-sm font-black text-brand-black">${parseFloat(currentBudget).toLocaleString()}</span>
                    </div>
                </div>

                {/* DANGER ZONE */}
                <div className="card-friendly p-10 bg-red-50 border-red-100">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-red-100 text-red-600 rounded-2xl shadow-inner">
                            <Lock className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-red-900">Protocolo de Cierre</h3>
                            <p className="text-xs text-red-400 font-bold uppercase tracking-widest">Acciones Irreversibles</p>
                        </div>
                    </div>

                    <p className="text-sm text-red-800 font-medium mb-8 leading-relaxed">
                        Al cerrar la elección, se bloquearán todas las operaciones de escritura (creación, edición, eliminación). El sistema pasará a modo <b>Solo Lectura</b> para preservación forense.
                    </p>

                    <button 
                        onClick={handleCloseElection}
                        disabled={loading}
                        className="w-full h-[60px] bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-red-600/20 hover:bg-red-700 transition-all flex items-center justify-center gap-2"
                    >
                        <ShieldAlert className="w-5 h-5" />
                        CERRAR ELECCIÓN
                    </button>
                </div>
            </div>
          </div>
      )}

      {/* TAB CONTENT: TERRITORY */}
      {activeTab === 'territory' && (
          <div className="animate-in slide-in-from-right-4 duration-300">
              <TerritoryConfigPage />
          </div>
      )}

      {/* TAB CONTENT: ELECTIONS */}
      {activeTab === 'elections' && (
          <div className="animate-in slide-in-from-right-4 duration-300">
              <ElectionManager />
          </div>
      )}

    </div>
  );
}
