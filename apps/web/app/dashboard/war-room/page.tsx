"use client";

import React, { useState } from 'react';
import { useCRM, E14Report } from '@/context/CRMContext';
import { Shield, LayoutDashboard, FileText, AlertTriangle, CheckCircle, X, TrendingUp } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function WarRoomPage() {
  const { pollingStations, reportE14, getElectionResults } = useCRM();
  const { myVotes, opponentVotes, tablesReported, totalTables } = getElectionResults();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState<string>('');
  const [newReport, setNewReport] = useState({
    tableNumber: '',
    votesCandidate: 0,
    votesOpponent: 0
  });

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    reportE14({
      stationId: selectedStation,
      tableNumber: newReport.tableNumber,
      votesCandidate: Number(newReport.votesCandidate),
      votesOpponent: Number(newReport.votesOpponent)
    });
    setIsModalOpen(false);
    setNewReport({ tableNumber: '', votesCandidate: 0, votesOpponent: 0 });
  };

  const reportedPercentage = Math.round((tablesReported / (totalTables || 1)) * 100);

  return (
    <div className="space-y-8">
      {/* Scoreboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#111827] rounded-[3rem] p-10 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10">
            <TrendingUp size={120} />
          </div>
          <div className="flex justify-between items-end relative z-10">
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Nuestro Candidato</p>
              <h2 className="text-7xl font-black tracking-tighter">{myVotes.toLocaleString()}</h2>
              <p className="text-xs font-bold opacity-50">Votos validados E-14</p>
            </div>
            <div className="text-center px-8 border-x border-white/10">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40 mb-4">VS</p>
              <div className="h-16 w-1 bg-blue-500/50 mx-auto rounded-full"></div>
            </div>
            <div className="space-y-2 text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-400">Oponente Principal</p>
              <h2 className="text-7xl font-black tracking-tighter">{opponentVotes.toLocaleString()}</h2>
              <p className="text-xs font-bold opacity-50">Votos informados</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[3rem] p-10 border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Progreso de Escrutinio</p>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-4">
            {reportedPercentage}% <span className="text-sm text-slate-400 font-bold tracking-normal">Mesas</span>
          </h3>
          <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
            <div 
              className="h-full bg-blue-600 transition-all duration-1000" 
              style={{ width: `${reportedPercentage}%` }}
            />
          </div>
          <p className="text-xs font-bold text-slate-500">
            {tablesReported} de {totalTables} mesas procesadas
          </p>
        </div>
      </div>

      {/* Polling Stations Grid */}
      <div>
        <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
          <Shield className="text-blue-600" /> Estado por Puesto de Votación
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pollingStations.map((station) => {
            const isComplete = station.reportedTables === station.totalTables && station.totalTables > 0;
            return (
              <div key={station.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-lg transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className={cn(
                    "p-3 rounded-2xl",
                    isComplete ? "bg-emerald-50 text-emerald-600" : "bg-blue-50 text-blue-600"
                  )}>
                    <LayoutDashboard size={24} />
                  </div>
                  {isComplete ? (
                    <CheckCircle className="text-emerald-500" size={20} />
                  ) : (
                    <AlertTriangle className="text-amber-500 animate-pulse" size={20} />
                  )}
                </div>
                <h4 className="text-lg font-black text-slate-900 mb-2">{station.name}</h4>
                <div className="flex justify-between text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">
                  <span>Mesas: {station.reportedTables}/{station.totalTables}</span>
                  <span>Testigos: {station.witnessesCount}</span>
                </div>
                <button 
                  onClick={() => {
                    setSelectedStation(station.id);
                    setIsModalOpen(true);
                  }}
                  className="w-full py-4 bg-slate-50 text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all border border-slate-100"
                >
                  Reportar E-14
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Report Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-900">Reporte de Mesa</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X /></button>
            </div>
            <form onSubmit={handleReport} className="p-8 space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Número de Mesa</label>
                <input required type="number" className="w-full px-4 py-3 border rounded-2xl text-sm font-bold" value={newReport.tableNumber} onChange={e => setNewReport({...newReport, tableNumber: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-blue-600 tracking-widest block mb-2">Nuestros Votos</label>
                  <input required type="number" className="w-full px-4 py-3 border-2 border-blue-100 rounded-2xl text-lg font-black text-blue-700" value={newReport.votesCandidate} onChange={e => setNewReport({...newReport, votesCandidate: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-red-600 tracking-widest block mb-2">Votos Oponente</label>
                  <input required type="number" className="w-full px-4 py-3 border-2 border-red-100 rounded-2xl text-lg font-black text-red-700" value={newReport.votesOpponent} onChange={e => setNewReport({...newReport, votesOpponent: Number(e.target.value)})} />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-4 border rounded-2xl text-xs font-black uppercase text-slate-600">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-4 bg-blue-600 rounded-2xl text-xs font-black uppercase text-white shadow-lg">Enviar Reporte</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
