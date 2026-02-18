"use client";

import React, { useState } from 'react';
import { useCRM } from '@/context/CRMContext';
import { ShieldCheck, AlertTriangle, FileText, Download, Upload, Clock, CheckCircle, X } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function CompliancePage() {
  const { compliance, getComplianceScore, uploadEvidence, logAction } = useCRM();
  const score = getComplianceScore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const handleUpload = () => {
    if (selectedId) {
      uploadEvidence(selectedId, 'evidencia_cargada.pdf');
      logAction('SuperAdmin', `Cargó soporte para obligación ID: ${selectedId}`, 'Compliance', 'Info');
      setIsModalOpen(false);
      setNotification('Soporte cargado exitosamente. Estado: Cumplido');
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const getDaysRemaining = (deadline: string) => {
    const diff = new Date(deadline).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 3600 * 24));
  };

  return (
    <div className="space-y-8">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white px-6 py-4 rounded-2xl shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex items-center gap-3">
          <CheckCircle size={20} />
          <span className="font-black text-xs uppercase tracking-widest">{notification}</span>
        </div>
      )}

      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter">Compliance Legal</h1>
          <p className="text-slate-500">Blindaje normativo y control ante el Consejo Nacional Electoral.</p>
        </div>
        <button 
          onClick={() => {
             logAction('SuperAdmin', 'Generó reporte consolidado CNE', 'Compliance', 'Warning');
             alert('Generando Reporte Oficial CNE... Formularios 5A, 5B y 5C en proceso.');
          }}
          className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-blue-600 transition-all flex items-center gap-2"
        >
          <Download size={18} /> Generar Reporte CNE
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Compliance Score Chart */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-100 shadow-sm flex flex-col items-center justify-center text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Estado de Blindaje Legal</p>
          <div className="relative w-48 h-48 flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90">
              <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="16" fill="transparent" className="text-slate-100" />
              <circle cx="96" cy="96" r="88" stroke="currentColor" strokeWidth="16" fill="transparent" 
                strokeDasharray={552.92} strokeDashoffset={552.92 - (552.92 * score) / 100}
                className={cn("transition-all duration-1000", score >= 80 ? "text-emerald-500" : score >= 50 ? "text-amber-500" : "text-red-500")} 
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black text-slate-900">{Math.round(score)}%</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cumplimiento</span>
            </div>
          </div>
          <div className="mt-8 flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-full">
            {score >= 80 ? <ShieldCheck className="text-emerald-500" size={16} /> : <AlertTriangle className="text-amber-500" size={16} />}
            <span className="text-[10px] font-black uppercase text-slate-600">
              {score >= 80 ? 'Riesgo Bajo' : 'Riesgo Moderado'}
            </span>
          </div>
        </div>

        {/* Matrix Section */}
        <div className="lg:col-span-2 bg-white border border-slate-100 rounded-[3rem] overflow-hidden shadow-sm">
          <div className="px-10 py-8 border-b border-slate-50 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-black text-slate-900 flex items-center gap-2">
              <FileText size={20} className="text-blue-600" /> Matriz de Obligaciones
            </h3>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{compliance.length} Pendientes</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <tr>
                  <th className="px-10 py-4">Obligación / CNE</th>
                  <th className="px-10 py-4">Vencimiento</th>
                  <th className="px-10 py-4">Estado</th>
                  <th className="px-10 py-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {compliance.map((o) => {
                  const days = getDaysRemaining(o.deadline);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-10 py-6">
                        <p className="text-sm font-black text-slate-900 mb-1">{o.title}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{o.type}</p>
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700">{o.deadline}</span>
                          {o.status !== 'Cumplido' && (
                            <span className={cn(
                              "text-[8px] font-black uppercase mt-1",
                              days < 0 ? "text-red-600" : days < 3 ? "text-amber-600" : "text-slate-400"
                            )}>
                              {days < 0 ? 'Vencido' : `${days} días restantes`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-10 py-6">
                        <span className={cn(
                          "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border",
                          o.status === 'Cumplido' ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                          o.status === 'Vencido' ? "bg-red-50 text-red-600 border-red-100" :
                          "bg-amber-50 text-amber-600 border-amber-100"
                        )}>
                          {o.status}
                        </span>
                      </td>
                      <td className="px-10 py-6 text-right">
                        {o.status !== 'Cumplido' ? (
                          <button 
                            onClick={() => { setSelectedId(o.id); setIsModalOpen(true); }}
                            className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"
                          >
                            <Upload size={16} />
                          </button>
                        ) : (
                          <CheckCircle className="text-emerald-500 ml-auto" size={20} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 space-y-6 text-center">
              <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <FileText size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Cargar Evidencia Legal</h3>
              <p className="text-slate-500 text-sm">
                Selecciona el archivo PDF o imagen que soporta el cumplimiento de esta obligación ante el CNE.
              </p>
              <div className="border-2 border-dashed border-slate-100 p-8 rounded-3xl bg-slate-50">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Arrastra el archivo aquí o haz clic</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400">Cancelar</button>
                <button onClick={handleUpload} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl text-xs font-black uppercase shadow-lg">Confirmar Carga</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
