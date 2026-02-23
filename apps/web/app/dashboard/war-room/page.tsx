"use client";

import React, { useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { AlertTriangle, CheckCircle, X, Inbox } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function WarRoomPage() {
  const { pollingStations, e14Reports, reportE14, getElectionResults } = useCRM();
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

  const reportedPercentage = totalTables > 0 ? Math.round((tablesReported / totalTables) * 100) : 0;
  
  // Calcular porcentaje de victoria
  const totalVotesCounted = myVotes + opponentVotes;
  const myWinPercentage = totalVotesCounted > 0 ? Math.round((myVotes / totalVotesCounted) * 100) : 0;
  const opponentWinPercentage = totalVotesCounted > 0 ? 100 - myWinPercentage : 0;

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <div>
        <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">Cuarto de Guerra</h1>
        <p className="text-slate-500 font-medium text-lg">Resultados en vivo (Día D). Información clara y directa.</p>
      </div>

      {/* Marcador Principal - Super Simplificado */}
      <div className="bg-white rounded-[3rem] p-8 md:p-12 border-4 border-slate-100 shadow-xl relative overflow-hidden">
        
        {/* Progreso General */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-12 pb-8 border-b-2 border-slate-50 gap-4">
          <div className="text-center md:text-left">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Escrutinio General</p>
            <h3 className="text-3xl font-black text-slate-900">
              {reportedPercentage}% <span className="text-lg text-slate-400">mesas informadas</span>
            </h3>
          </div>
          <div className="w-full md:w-1/2">
            <div className="flex justify-between text-xs font-bold text-slate-500 mb-2">
              <span>0%</span>
              <span>{tablesReported} de {totalTables} mesas</span>
              <span>100%</span>
            </div>
            <div className="h-4 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-slate-800 transition-all duration-1000 rounded-full" 
                style={{ width: `${reportedPercentage}%` }}
              />
            </div>
          </div>
        </div>

        {/* Los Votos */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16">
          {/* Nosotros */}
          <div className="bg-teal-50 rounded-[2rem] p-8 border-2 border-teal-100 text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-2 bg-teal-500" />
            <p className="text-sm font-black uppercase tracking-widest text-teal-700 mb-4">Nuestros Votos</p>
            <h2 className="text-6xl md:text-8xl font-black tracking-tighter text-teal-900 mb-4">{myVotes.toLocaleString()}</h2>
            <div className="inline-block bg-white px-4 py-2 rounded-full text-teal-700 font-bold text-lg shadow-sm">
              {myWinPercentage}% del total
            </div>
          </div>

          {/* Oponente */}
          <div className="bg-red-50 rounded-[2rem] p-8 border-2 border-red-100 text-center relative overflow-hidden">
             <div className="absolute top-0 left-0 w-full h-2 bg-red-500" />
            <p className="text-sm font-black uppercase tracking-widest text-red-700 mb-4">Oponente Principal</p>
            <h2 className="text-6xl md:text-8xl font-black tracking-tighter text-red-900 mb-4">{opponentVotes.toLocaleString()}</h2>
            <div className="inline-block bg-white px-4 py-2 rounded-full text-red-700 font-bold text-lg shadow-sm">
              {opponentWinPercentage}% del total
            </div>
          </div>
        </div>
        
        {/* Barra de diferencia visual */}
        {totalVotesCounted > 0 && (
          <div className="mt-12">
             <p className="text-center text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Diferencia Visual</p>
             <div className="h-8 w-full flex rounded-full overflow-hidden shadow-inner">
                <div className="h-full bg-teal-500 transition-all duration-1000 flex items-center px-4" style={{ width: `${myWinPercentage}%` }}>
                  {myWinPercentage > 10 && <span className="text-white text-xs font-bold">{myWinPercentage}%</span>}
                </div>
                <div className="h-full bg-red-500 transition-all duration-1000 flex items-center justify-end px-4" style={{ width: `${opponentWinPercentage}%` }}>
                   {opponentWinPercentage > 10 && <span className="text-white text-xs font-bold">{opponentWinPercentage}%</span>}
                </div>
             </div>
          </div>
        )}
      </div>

      {/* Puestos de Votación - Lista Clara */}
      <div>
        <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3">
          <Inbox className="text-slate-400" /> 
          Puestos de Votación
        </h3>
        
        <div className="bg-white rounded-[2rem] border-2 border-slate-100 shadow-sm overflow-hidden">
          {pollingStations.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-lg font-bold">No hay puestos de votación configurados.</p>
            </div>
          ) : (
            <div className="divide-y-2 divide-slate-50">
              {pollingStations.map((station) => {
                const isComplete = station.reportedTables === station.totalTables && station.totalTables > 0;
                const percentage = station.totalTables > 0 ? Math.round((station.reportedTables / station.totalTables) * 100) : 0;
                
                return (
                  <div key={station.id} className="p-6 hover:bg-slate-50 transition-colors flex flex-col md:flex-row items-center justify-between gap-6">
                    
                    {/* Info del Puesto */}
                    <div className="flex-1 flex items-center gap-4">
                      <div className={cn(
                        "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                        isComplete ? "bg-emerald-100 text-emerald-600" : "bg-amber-100 text-amber-600"
                      )}>
                        {isComplete ? <CheckCircle size={24} /> : <AlertTriangle size={24} />}
                      </div>
                      <div>
                        <h4 className="text-xl font-black text-slate-900">{station.name}</h4>
                        <p className="text-sm font-bold text-slate-500">
                          {station.witnessesCount} Testigos asignados
                        </p>
                      </div>
                    </div>

                    {/* Progreso del Puesto */}
                    <div className="flex-1 w-full">
                      <div className="flex justify-between text-xs font-black uppercase tracking-widest mb-2">
                        <span className={isComplete ? "text-emerald-600" : "text-slate-500"}>
                          Mesas: {station.reportedTables} / {station.totalTables}
                        </span>
                        <span className="text-slate-400">{percentage}%</span>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        {Array.from({ length: station.totalTables }).map((_, i) => {
                          const tableNum = (i + 1).toString();
                          const report = e14Reports.find(r => r.stationId === station.id && r.tableNumber === tableNum);
                          const isReported = !!report;
                          
                          return (
                            <button 
                              key={tableNum}
                              onClick={() => {
                                setSelectedStation(station.id);
                                setNewReport({
                                  tableNumber: tableNum,
                                  votesCandidate: report ? report.votesCandidate : 0,
                                  votesOpponent: report ? report.votesOpponent : 0
                                });
                                setIsModalOpen(true);
                              }}
                              className={cn(
                                "w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black transition-all border-2",
                                isReported 
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-sm" 
                                  : "bg-slate-50 text-slate-400 border-transparent hover:border-teal-200 hover:text-teal-600 hover:bg-white"
                              )}
                              title={isReported ? `Mesa ${tableNum} - Reportada: Nosotros ${report.votesCandidate}, Oponente ${report.votesOpponent}` : `Mesa ${tableNum} - Sin reportar`}
                            >
                              {tableNum}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal Extra Simple */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border-4 border-slate-100">
            
            <div className="p-8 pb-4 flex justify-between items-start">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight leading-none mb-2">Ingresar Votos</h3>
                <p className="text-slate-500 font-medium">Transcribe los datos exactos del formulario E-14.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-100 text-slate-400 hover:text-slate-900 rounded-full transition-colors"><X size={24} /></button>
            </div>

            <form onSubmit={handleReport} className="p-8 pt-4 space-y-8">
              
              <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                <label className="text-sm font-black uppercase text-slate-600 tracking-widest block mb-3">Mesa Seleccionada</label>
                <input 
                  readOnly 
                  type="text" 
                  className="w-full px-6 py-4 bg-slate-100 border-2 border-slate-200 rounded-2xl text-2xl font-black focus:border-slate-800 outline-none text-center cursor-not-allowed text-slate-500" 
                  value={`Mesa ${newReport.tableNumber}`} 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-teal-50 p-6 rounded-3xl border-2 border-teal-100 text-center">
                  <label className="text-[10px] font-black uppercase text-teal-800 tracking-widest block mb-3">Nuestros Votos</label>
                  <input 
                    required 
                    type="number" 
                    min="0"
                    className="w-full px-4 py-4 bg-white border-2 border-teal-200 rounded-2xl text-3xl font-black text-teal-700 focus:border-teal-500 outline-none transition-colors text-center" 
                    value={newReport.votesCandidate || ''} 
                    onChange={e => setNewReport({...newReport, votesCandidate: Number(e.target.value)})} 
                  />
                </div>
                <div className="bg-red-50 p-6 rounded-3xl border-2 border-red-100 text-center">
                  <label className="text-[10px] font-black uppercase text-red-800 tracking-widest block mb-3">Votos Oponente</label>
                  <input 
                    required 
                    type="number" 
                    min="0"
                    className="w-full px-4 py-4 bg-white border-2 border-red-200 rounded-2xl text-3xl font-black text-red-700 focus:border-red-500 outline-none transition-colors text-center" 
                    value={newReport.votesOpponent || ''} 
                    onChange={e => setNewReport({...newReport, votesOpponent: Number(e.target.value)})} 
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-5 border-2 border-slate-200 rounded-2xl text-sm font-black uppercase text-slate-500 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" className="flex-1 px-6 py-5 bg-slate-900 rounded-2xl text-sm font-black uppercase text-white shadow-xl hover:bg-teal-600 transition-colors">
                  Guardar Datos E-14
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}

