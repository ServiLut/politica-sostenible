'use client';

import React, { useState, useEffect } from 'react';
import { closeElectionDay } from '@/app/actions/election';

// Mock Data Types
interface DashboardState {
  targetVotes: number;
  readyToVote: number;
  votesRecorded: number;
  tablesTotal: number;
  tablesWithEvidence: number;
  anomalies: string[];
}

export const DayDControlCenter = ({ electionId, actorId }: { electionId: string, actorId: string }) => {
  const [data, setData] = useState<DashboardState>({
    targetVotes: 50000,
    readyToVote: 42000,
    votesRecorded: 15000,
    tablesTotal: 500,
    tablesWithEvidence: 120,
    anomalies: ['Pico de tráfico en Comuna 13', 'Mesa 45 sin reporte hace 2h']
  });

  // Real-time Simulation
  useEffect(() => {
    const interval = setInterval(() => {
      // Simulate live incoming votes
      setData(prev => ({
        ...prev,
        votesRecorded: prev.votesRecorded + Math.floor(Math.random() * 50),
        tablesWithEvidence: prev.tablesWithEvidence + (Math.random() > 0.8 ? 1 : 0)
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleCloseElection = async () => {
    const pin = prompt('🔐 ALERTA: Esta acción es irreversible. Ingrese PIN de Seguridad:');
    if (!pin) return;
    
    try {
      await closeElectionDay(electionId, actorId, pin);
      alert('Elección Cerrada Exitosamente.');
    } catch (e: any) {
      alert(`Error: ${e.message}`);
    }
  };

  const progress = Math.round((data.votesRecorded / data.targetVotes) * 100);
  const evidenceProgress = Math.round((data.tablesWithEvidence / data.tablesTotal) * 100);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 font-mono">
      {/* HEADER */}
      <header className="flex justify-between items-center mb-10 border-b border-slate-700 pb-6">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-blue-400">CENTRO DE MANDO DÍA D</h1>
          <p className="text-slate-400 text-sm mt-1">Estatus en Tiempo Real • {new Date().toLocaleTimeString()}</p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase">Tiempo Restante</p>
            <p className="text-2xl font-bold text-red-500 animate-pulse">04:32:10</p>
          </div>
          <button 
            onClick={handleCloseElection}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded font-bold border border-red-500"
          >
            🛑 CERRAR URNAS
          </button>
        </div>
      </header>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* COL 1: VOTING FUNNEL */}
        <div className="lg:col-span-2 space-y-8">
          {/* Big Number */}
          <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700">
            <h3 className="text-slate-400 text-sm uppercase tracking-widest mb-2">Votos Confirmados</h3>
            <div className="flex items-end gap-4">
              <span className="text-6xl font-bold text-green-400">{data.votesRecorded.toLocaleString()}</span>
              <span className="text-xl text-slate-500 mb-2">/ {data.targetVotes.toLocaleString()} ({progress}%)</span>
            </div>
            {/* Progress Bar */}
            <div className="w-full bg-slate-700 h-4 rounded-full mt-4 overflow-hidden">
              <div 
                className="bg-green-500 h-full transition-all duration-1000" 
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Detailed Funnel */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800 p-4 rounded-xl border-l-4 border-blue-500">
              <p className="text-xs text-slate-400 uppercase">Base Objetivo</p>
              <p className="text-2xl font-bold">{data.targetVotes.toLocaleString()}</p>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border-l-4 border-yellow-500">
              <p className="text-xs text-slate-400 uppercase">Listos para Votar</p>
              <p className="text-2xl font-bold">{data.readyToVote.toLocaleString()}</p>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border-l-4 border-green-500">
              <p className="text-xs text-slate-400 uppercase">Ya Votaron</p>
              <p className="text-2xl font-bold">{data.votesRecorded.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* COL 2: EVIDENCE & ALERTS */}
        <div className="space-y-6">
          
          {/* Evidence Monitor */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700">
            <h3 className="text-slate-400 text-sm uppercase tracking-widest mb-4">Monitor E-14</h3>
            <div className="flex justify-between items-center mb-2">
              <span className="text-3xl font-bold text-yellow-400">{evidenceProgress}%</span>
              <span className="text-sm text-slate-500">Completado</span>
            </div>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {/* Mock Missing List */}
              {[1,2,3].map(i => (
                <div key={i} className="flex justify-between items-center text-sm p-2 bg-slate-700/50 rounded">
                  <span className="text-red-400 font-bold">Mesa {10 + i}</span>
                  <span className="text-slate-400">Sin reporte</span>
                </div>
              ))}
            </div>
          </div>

          {/* Anomaly Radar */}
          <div className="bg-slate-800 p-6 rounded-2xl border border-red-900/30">
            <h3 className="text-red-400 text-sm uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"/> Radar de Anomalías
            </h3>
            <ul className="space-y-3">
              {data.anomalies.map((alert, idx) => (
                <li key={idx} className="text-sm border-b border-slate-700 pb-2 last:border-0">
                  ⚠️ {alert}
                </li>
              ))}
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
};
