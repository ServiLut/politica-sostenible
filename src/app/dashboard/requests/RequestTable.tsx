'use client';

import { useState } from 'react';
import { Check, Trash2, Shield, Calendar, Loader2 } from 'lucide-react';
import { approveUser, rejectUser } from '@/app/actions/admin-requests';
import { toast } from 'sonner';

interface RequestTableProps {
  users: any[];
}

export default function RequestTable({ users }: RequestTableProps) {
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApprove = async (userId: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas aprobar el acceso de ${name}?`)) return;
    
    setProcessingId(userId);
    try {
      const res = await approveUser(userId);
      if (res.success) {
        toast.success(`Acceso concedido a ${name}`);
      } else {
        toast.error(res.error || 'Error al aprobar usuario');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (userId: string, name: string) => {
    if (!confirm(`¿Estás seguro de que deseas RECHAZAR y ELIMINAR la solicitud de ${name}? Esta acción no se puede deshacer.`)) return;

    setProcessingId(userId);
    try {
      const res = await rejectUser(userId);
      if (res.success) {
        toast.error(`Solicitud de ${name} rechazada y eliminada`);
      } else {
        toast.error(res.error || 'Error al rechazar usuario');
      }
    } catch (error) {
      toast.error('Error de conexión');
    } finally {
      setProcessingId(null);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-50 text-red-700 border-red-100';
      case 'COORDINATOR': return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'LEADER': return 'bg-brand-green-50 text-brand-green-700 border-brand-green-100';
      default: return 'bg-gray-50 text-gray-700 border-gray-100';
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-brand-gray-50 border-b border-brand-gray-100">
          <tr>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-brand-gray-400">Usuario</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-brand-gray-400">Rol Solicitado</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-brand-gray-400">Fecha Registro</th>
            <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-brand-gray-400 text-right">Acciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-gray-50">
          {users.map((user) => (
            <tr key={user.id} className="hover:bg-brand-gray-50/50 transition-colors group">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-gray-100 flex items-center justify-center font-black text-brand-black border-2 border-white shadow-sm group-hover:bg-white">
                    {user.fullName?.charAt(0) || '?'}
                  </div>
                  <div>
                    <p className="font-bold text-brand-black">{user.fullName || 'Sin Nombre'}</p>
                    <p className="text-xs text-brand-gray-500 font-medium">ID: {user.id.substring(0, 8)}...</p>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-black border uppercase tracking-tighter ${getRoleBadgeColor(user.role)}`}>
                  <Shield className="w-3 h-3" />
                  {user.role || 'N/A'}
                </span>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-brand-gray-500 font-medium text-sm">
                  <Calendar className="w-4 h-4" />
                  {new Date(user.createdAt).toLocaleDateString('es-ES', { 
                    day: '2-digit', 
                    month: 'short', 
                    year: 'numeric' 
                  })}
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    disabled={processingId !== null}
                    onClick={() => handleApprove(user.id, user.fullName)}
                    className="p-2 bg-brand-green-100 text-brand-green-700 rounded-xl hover:bg-brand-green-600 hover:text-white transition-all active:scale-90 disabled:opacity-50"
                    title="Aprobar Acceso"
                  >
                    {processingId === user.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  </button>
                  <button
                    disabled={processingId !== null}
                    onClick={() => handleReject(user.id, user.fullName)}
                    className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all active:scale-90 disabled:opacity-50"
                    title="Rechazar y Eliminar"
                  >
                    {processingId === user.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
