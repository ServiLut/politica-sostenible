'use client';

import React, { useState, useEffect } from 'react';
import { 
    Shield, Filter, ChevronLeft, ChevronRight, Activity, Download, 
    AlertTriangle, ShieldAlert, Lock, User, DollarSign, XCircle, 
    FileUp, Users, Eye, Edit2, Ban, Receipt, History, UserCheck, 
    Smartphone, Monitor, MapPin
} from 'lucide-react';
import { toast } from 'sonner';
import { setSystemLockStatus, getSecurityLogs } from '@/app/actions/security';

// Helper to parse log details
const formatLogDetails = (action: string, details: any) => {
    let data = details;
    if (typeof details === 'string') {
        try { data = JSON.parse(details); } catch { return details; }
    }
    data = data || {};

    const iconClass = "w-3.5 h-3.5 text-brand-gray-400 inline-block mr-1.5 mb-0.5";

    if (action === 'VIEW_DASHBOARD') return (
        <span className="flex items-center">
            <Eye className={iconClass} />
            Acceso al Panel Principal
        </span>
    );

    if (action === 'VIEW_PROFILE') return (
        <span className="flex items-center">
            <User className={iconClass} />
            Consulta de perfil: <span className="font-black ml-1 text-brand-black">{data.targetName || 'Desconocido'}</span>
        </span>
    );

    if (action === 'UPDATE_USER') return (
        <span className="flex items-center">
            <Edit2 className={iconClass} />
            Modificación de usuario: <span className="font-black ml-1 text-brand-black">{data.targetName || (data.targetId ? `ID ${data.targetId}` : 'N/A')}</span>
        </span>
    );

    if (action === 'FINANCE_UPLOAD' || action.includes('GASTO')) {
        return (
            <span className="flex items-center">
                <Receipt className={iconClass} />
                Registro de gasto: <span className="font-black ml-1 text-brand-black">${Number(data.amount || 0).toLocaleString()}</span>
                <span className="ml-1 opacity-60 text-[9px]">({data.category || 'General'})</span>
            </span>
        );
    }

    if (action === 'MISSION_REJECT') return (
        <span className="flex items-center text-red-600">
            <Ban className={iconClass + " text-red-500"} />
            Misión rechazada: <span className="font-black ml-1 italic">&quot;{data.missionTitle || 'Sin título'}&quot;</span>
        </span>
    );

    // Fallbacks
    if (action.includes('LOGIN') || action.includes('ACCESS')) {
        return (
            <span className="flex flex-col gap-0.5">
                <span className="flex items-center">
                    <MapPin className={iconClass} />
                    IP: <span className="font-bold ml-1">{data.ip || 'N/A'}</span>
                </span>
                <span className="flex items-center opacity-70 text-[9px]">
                    <Monitor className="w-2.5 h-2.5 mr-1" />
                    {data.userAgent?.substring(0, 30)}...
                </span>
            </span>
        );
    }

    if (action === 'MARK_VOTED') {
        return (
            <span className="flex items-center">
                <UserCheck className={iconClass} />
                Votación registrada por: <span className="font-black ml-1">{data.leaderId ? `Líder ID ${data.leaderId.substring(0,4)}` : 'N/A'}</span>
            </span>
        );
    }

    if (data.msg) return data.msg;
    
    try {
        const str = JSON.stringify(data);
        return str === '{}' ? (
            <span className="flex items-center opacity-60 italic">
                <History className={iconClass} />
                Acción del sistema
            </span>
        ) : (str.length > 50 ? str.substring(0, 50) + '...' : str);
    } catch { return 'Datos binarios'; }
};

// Helper for Icons
const getActionIcon = (action: string) => {
    if (action.includes('FINANCE')) return <DollarSign className="w-3 h-3 text-green-600" />;
    if (action.includes('ERROR') || action.includes('REJECT') || action.includes('VIOLACIÓN')) return <XCircle className="w-3 h-3 text-red-600" />;
    if (action.includes('TEAM') || action.includes('USER')) return <Users className="w-3 h-3 text-blue-600" />;
    if (action.includes('UPLOAD')) return <FileUp className="w-3 h-3 text-amber-600" />;
    return <Activity className="w-3 h-3 text-gray-400" />;
};

export default function SecurityLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');

  useEffect(() => {
      loadLogs();
  }, [page, actionFilter]);

  const loadLogs = async () => {
      setLoading(true);
      try {
          const res = await getSecurityLogs();
          if (res.success) {
              setLogs(res.data);
              setTotalPages(1); // Pending server-side pagination
          }
      } catch (e) {
          console.error(e);
          toast.error('Error de conexión con auditoría');
      } finally {
          setLoading(false);
      }
  };

  const handlePageChange = (newPage: number) => {
      setPage(newPage);
  };
  
  // Lock State
  // Local state no longer needed for full screen lock as layout handles it globally
  // We keep the panic trigger here.

  const handlePanic = async () => {
      const confirm = window.prompt('⚠️ PROTOCOLO DE EMERGENCIA ⚠️\n\nEscribe "BLOQUEAR" para confirmar el cierre preventivo del sistema.');
      if (confirm === 'BLOQUEAR') {
          try {
              const res = await setSystemLockStatus(true);
              if (res.success) {
                  toast.error('PROTOCOLO DE EMERGENCIA ACTIVADO', { 
                      description: 'El sistema ha entrado en modo de contención persistente.',
                      duration: 10000
                  });
                  // Force refresh to trigger layout lock
                  window.location.reload(); 
              }
          } catch (e: any) {
              toast.error('Error al bloquear sistema', { description: e.message });
          }
      }
  };

  // We remove the local lock screen render block here because the Layout will catch the state change
  // and render the global <EmergencyLockScreen />.

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 transition-all">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-brand-black tracking-tight flex items-center gap-2">
              Traza de Auditoría
          </h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-widest mt-1">Supervisión inmutable de seguridad</p>
        </div>
        
        <div className="flex items-center gap-4">
            {/* PANIC BUTTON */}
            <button 
                onClick={handlePanic}
                className="flex items-center gap-2 px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg hover:scale-105 active:scale-95 bg-red-600 text-white hover:bg-red-700 shadow-red-200"
            >
                <ShieldAlert className="w-4 h-4" />
                Bloqueo de Emergencia
            </button>

            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border-2 border-brand-gray-100 shadow-sm transition-all focus-within:border-brand-black">
                <Filter className="w-4 h-4 text-brand-gray-400 ml-2" />
                <select 
                    className="bg-transparent text-xs font-black text-brand-gray-700 outline-none pr-4 uppercase tracking-tighter cursor-pointer"
                    value={actionFilter}
                    onChange={e => setActionFilter(e.target.value)}
                >
                    <option value="">Todas las Acciones</option>
                    <option value="MARK_VOTED">Votación</option>
                    <option value="FINANCE_UPLOAD">Subida de Gastos</option>
                    <option value="TEAM_UPDATE">Cambios de Equipo</option>
                    <option value="MISSION_REJECT">Misión Rechazada</option>
                    <option value="ERROR_ACCESS">Acceso Denegado</option>
                    <option value="VIOLACIÓN DE ROL">Violación de Rol</option>
                    <option value="SENSITIVE_DATA_UPLOAD">Carga Datos Sensibles</option>
                </select>
            </div>
        </div>
      </div>

      <div className="card-friendly overflow-hidden">
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-brand-gray-100">
                <thead className="bg-brand-gray-50">
                    <tr>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Fecha / Hora</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Actor</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Acción</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Entidad</th>
                        <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-400 uppercase tracking-widest">Detalle del Evento</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-brand-gray-50 bg-white">
                    {loading ? (
                        <tr><td colSpan={5} className="p-20 text-center text-brand-gray-400 font-bold uppercase text-[10px] tracking-widest animate-pulse italic">Escaneando registros de seguridad...</td></tr>
                    ) : logs.length > 0 ? (
                        logs.map(log => (
                            <tr key={log.id} className="hover:bg-brand-gray-50 transition-colors group">
                                <td className="px-6 py-5 text-[10px] font-black text-brand-gray-500 whitespace-nowrap">
                                    {new Date(log.createdAt).toLocaleString()}
                                </td>
                                <td className="px-6 py-5 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-brand-black text-white rounded-xl flex items-center justify-center text-[10px] font-black shadow-lg">
                                            {log.user?.fullName?.charAt(0) || '?'}
                                        </div>
                                        <div>
                                            <div className="text-[11px] font-black text-brand-black uppercase tracking-tight">{log.user?.fullName || 'Sistema'}</div>
                                            <div className="text-[9px] text-brand-gray-400 font-bold uppercase tracking-widest">{log.user?.role || 'CORE'}</div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-5 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        {getActionIcon(log.action)}
                                        <span className={`px-2 py-1 rounded-lg text-[9px] font-black border uppercase tracking-wider
                                            ${log.action.includes('ERROR') || log.action.includes('VIOLACIÓN') ? 'bg-red-50 text-red-600 border-red-100' :
                                            log.action.includes('UPLOAD') ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                            log.action === 'MARK_VOTED' ? 'bg-brand-green-50 text-brand-green-700 border-brand-green-100' :
                                            'bg-brand-gray-100 text-brand-gray-600 border-brand-gray-200'}
                                        `}>
                                            {log.action.replace(/_/g, ' ')}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-5 text-[10px] text-brand-gray-600 font-bold uppercase">
                                    {log.entity} <span className="text-brand-gray-300 ml-1">#{log.entityId?.substring(0,4)}</span>
                                </td>
                                <td className="px-6 py-5 text-[10px] text-brand-gray-500 font-medium max-w-sm truncate group-hover:text-brand-black transition-colors">
                                    {formatLogDetails(log.action, log.details)}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr><td colSpan={5} className="p-20 text-center text-brand-gray-300 font-bold italic">No se han detectado eventos en el periodo actual.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
        
        <div className="bg-brand-gray-50 p-6 border-t border-brand-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-black text-brand-gray-400 uppercase tracking-widest italic">Bloque {page} de {totalPages} de la cadena de bloques interna</span>
            <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => handlePageChange(page - 1)} className="p-3 rounded-xl bg-white border border-brand-gray-200 hover:border-brand-black transition-all disabled:opacity-30 shadow-sm">
                    <ChevronLeft className="w-4 h-4 text-brand-black" />
                </button>
                <button disabled={page >= totalPages} onClick={() => handlePageChange(page + 1)} className="p-3 rounded-xl bg-white border border-brand-gray-200 hover:border-brand-black transition-all disabled:opacity-30 shadow-sm">
                    <ChevronRight className="w-4 h-4 text-brand-black" />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
}