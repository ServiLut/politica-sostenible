"use client";

import React, { useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { Shield, LayoutDashboard, AlertTriangle, CheckCircle, X, TrendingUp } from 'lucide-react';
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
        <div className="lg:col-span-2 bg-teal-50 rounded-[3rem] p-10 text-slate-900 border-2 border-teal-200 shadow-sm relative overflow-hidden group hover:bg-white hover:border-teal-500 hover:shadow-2xl hover:shadow-teal-500/10 hover:-translate-y-1 transition-all duration-500">
          <div className="absolute top-0 right-0 p-8 text-teal-200 opacity-0 group-hover:opacity-100 group-hover:scale-110 group-hover:text-teal-300 transition-all duration-700">
            <TrendingUp size={120} />
          </div>
          <div className="flex flex-col md:flex-row justify-between items-center md:items-end relative z-10 gap-8">
            <div className="space-y-2 text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-teal-600">Nuestro Candidato</p>
              </div>
              <h2 className="text-7xl font-black tracking-tighter text-slate-900">{myVotes.toLocaleString()}</h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Votos validados E-14</p>
            </div>
            
            <div className="flex flex-col items-center justify-center py-4">
              <div className="px-4 py-1 bg-slate-900 text-white rounded-full text-[10px] font-black tracking-[0.3em] mb-4 shadow-lg shadow-slate-200">VS</div>
              <div className="h-12 w-1 bg-teal-200 mx-auto rounded-full"></div>
            </div>

            <div className="space-y-2 text-center md:text-right">
              <div className="flex items-center justify-center md:justify-end gap-2 mb-1">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-red-600">Oponente Principal</p>
                <div className="w-2 h-2 rounded-full bg-red-500" />
              </div>
              <h2 className="text-7xl font-black tracking-tighter text-slate-900">{opponentVotes.toLocaleString()}</h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Votos informados</p>
            </div>
          </div>
        </div>

        <div className="bg-teal-50 rounded-[3rem] p-10 border-2 border-teal-200 shadow-sm flex flex-col justify-center group hover:bg-white hover:border-teal-500 hover:shadow-2xl hover:shadow-teal-500/10 hover:-translate-y-1 transition-all duration-500">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">Progreso de Escrutinio</p>
          <h3 className="text-4xl font-black text-slate-900 tracking-tighter mb-4">
            {reportedPercentage}% <span className="text-sm text-slate-400 font-bold tracking-normal">Mesas</span>
          </h3>
          <div className="h-4 w-full bg-slate-200 rounded-full overflow-hidden mb-4">
            <div 
              className="h-full bg-teal-600 transition-all duration-1000" 
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
          <Shield className="text-teal-600" /> Estado por Puesto de Votación
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {pollingStations.map((station) => {
            const isComplete = station.reportedTables === station.totalTables && station.totalTables > 0;
            return (
              <div key={station.id} className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-100 shadow-sm hover:shadow-lg transition-all">
                <div className="flex justify-between items-start mb-6">
                  <div className={cn(
                    "p-3 rounded-2xl",
                    isComplete ? "bg-emerald-50 text-emerald-600" : "bg-teal-50 text-teal-600"
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
                  className="w-full py-4 bg-slate-50 text-slate-900 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-teal-600 hover:text-white transition-all border border-slate-100"
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
                <input required type="number" className="w-full px-4 py-3 border rounded-2xl text-sm font-bold focus:border-teal-500 outline-none" value={newReport.tableNumber} onChange={e => setNewReport({...newReport, tableNumber: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-teal-600 tracking-widest block mb-2">Nuestros Votos</label>
                  <input required type="number" className="w-full px-4 py-3 border-2 border-teal-100 rounded-2xl text-lg font-black text-teal-700 focus:border-teal-500 outline-none" value={newReport.votesCandidate} onChange={e => setNewReport({...newReport, votesCandidate: Number(e.target.value)})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-red-600 tracking-widest block mb-2">Votos Oponente</label>
                  <input required type="number" className="w-full px-4 py-3 border-2 border-red-100 rounded-2xl text-lg font-black text-red-700 focus:border-red-500 outline-none" value={newReport.votesOpponent} onChange={e => setNewReport({...newReport, votesOpponent: Number(e.target.value)})} />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-4 border rounded-2xl text-xs font-black uppercase text-slate-600">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-4 bg-teal-600 rounded-2xl text-xs font-black uppercase text-white shadow-lg hover:bg-teal-700 transition-all">Enviar Reporte</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
