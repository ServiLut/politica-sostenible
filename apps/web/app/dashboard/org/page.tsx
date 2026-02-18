"use client";

import React, { useState } from 'react';
import { useCRM, TeamMember } from '@/context/CRMContext';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Users, UserPlus, Shield, MapPin, TrendingUp, X, Mail, Edit, Ban, RotateCcw } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function OrgPage() {
  const { team, inviteMember, updateMember, toggleMemberStatus, getTeamStats } = useCRM();
  const { role: currentUserRole } = useAuth();
  const { success: toastSuccess } = useToast();
  const { totalTasks, completedTasks, teamEfficiency } = getTeamStats();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [memberToToggle, setMemberToToggle] = useState<TeamMember | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  
  const [newMember, setNewMember] = useState<Omit<TeamMember, 'id' | 'performance' | 'status'>>({
    name: '',
    role: 'Voluntario',
    territory: '',
    email: ''
  });

  const isAdmin = currentUserRole === 'SuperAdmin' || currentUserRole === 'AdminCampana';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMember) {
      updateMember(editingMember.id, newMember);
      toastSuccess("Miembro actualizado correctamente");
    } else {
      inviteMember(newMember);
      toastSuccess("Invitación enviada correctamente");
    }
    setIsModalOpen(false);
    setEditingMember(null);
    setNewMember({ name: '', role: 'Voluntario', territory: '', email: '' });
  };

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member);
    setNewMember({
      name: member.name,
      role: member.role,
      territory: member.territory,
      email: member.email
    });
    setIsModalOpen(true);
  };

  const handleToggleStatusClick = (member: TeamMember) => {
    setMemberToToggle(member);
    setIsStatusModalOpen(true);
  };

  const handleConfirmToggleStatus = () => {
    if (memberToToggle) {
      const isSuspending = memberToToggle.status === 'active';
      toggleMemberStatus(memberToToggle.id);
      
      if (isSuspending) {
        toastSuccess("Acceso suspendido correctamente");
      } else {
        toastSuccess("Acceso reactivado correctamente");
      }
      
      setMemberToToggle(null);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingMember(null);
    setNewMember({ name: '', role: 'Voluntario', territory: '', email: '' });
  };

  const roleCounts = team.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Organización y Equipo</h1>
          <p className="text-slate-500">Gestión de la estructura jerárquica y nodos operativos.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <UserPlus size={20} /> Invitar Usuario
        </button>
      </div>

      {/* active nodes panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[#111827] text-white p-8 rounded-[2.5rem] shadow-xl">
          <p className="text-[10px] font-black opacity-60 uppercase tracking-[0.2em] mb-2">Eficiencia de Equipo</p>
          <h3 className="text-4xl font-black tracking-tighter mb-4">{Math.round(teamEfficiency)}%</h3>
          <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${teamEfficiency}%` }}></div>
          </div>
        </div>
        {Object.entries(roleCounts).map(([role, count]) => (
          <div key={role} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{role}s</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{count}</h3>
            <p className="text-xs font-bold text-slate-400 mt-2">Nodos activos</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-black text-slate-900 flex items-center gap-2">
            <Users size={20} className="text-blue-600" /> Miembros de la Campaña
          </h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{team.length} Integrantes</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-widest">
              <tr>
                <th className="px-8 py-4">Integrante</th>
                <th className="px-8 py-4">Rol</th>
                <th className="px-8 py-4">Territorio</th>
                <th className="px-8 py-4">Rendimiento</th>
                <th className="px-8 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {team.map((m) => (
                <tr key={m.id} className={cn(
                  "hover:bg-slate-50/50 transition-colors",
                  m.status === 'suspended' && "opacity-50 grayscale"
                )}>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-xs font-black text-slate-500 shadow-inner relative">
                        {m.name.charAt(0)}
                        {m.status === 'suspended' && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center">
                            <Ban size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-900">{m.name}</p>
                          {m.status === 'suspended' && (
                            <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-widest uppercase">
                              Suspendido
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border",
                      m.role.includes('Admin') ? "bg-blue-50 text-blue-600 border-blue-100" :
                      m.role.includes('Líder') ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                      "bg-slate-50 text-slate-600 border-slate-100"
                    )}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-8 py-4 text-xs font-bold text-slate-500">
                    <div className="flex items-center gap-1">
                      <MapPin size={12} className="text-slate-300" /> {m.territory}
                    </div>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            m.performance > 80 ? "bg-emerald-500" : m.performance > 50 ? "bg-amber-500" : "bg-red-500"
                          )} 
                          style={{ width: `${m.performance}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-black text-slate-400">{m.performance}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleEdit(m)}
                        className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <Edit size={16} />
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={() => handleToggleStatusClick(m)}
                          className={cn(
                            "p-2 transition-colors",
                            m.status === 'active' ? "text-slate-400 hover:text-amber-600" : "text-emerald-400 hover:text-emerald-600"
                          )}
                        >
                          {m.status === 'active' ? <Ban size={16} /> : <RotateCcw size={16} />}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-8 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">
                  {editingMember ? 'Editar Miembro' : 'Invitar al Equipo'}
                </h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Crecimiento Orgánico</p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Nombre Completo</label>
                  <input required placeholder="Ej: Diana Sánchez" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Correo Electrónico</label>
                  <input required type="email" placeholder="email@campana.com" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Rol</label>
                    <select className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none" value={newMember.role} onChange={e => setNewMember({...newMember, role: e.target.value})}>
                      <option value="Admin Campaña">Admin Campaña</option>
                      <option value="Coordinador">Coordinador</option>
                      <option value="Líder Territorial">Líder Territorial</option>
                      <option value="Voluntario">Voluntario</option>
                      <option value="Testigo">Testigo</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Territorio</label>
                    <input required placeholder="Ej: Medellín" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newMember.territory} onChange={e => setNewMember({...newMember, territory: e.target.value})} />
                  </div>
                </div>
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-4 bg-blue-600 rounded-2xl text-xs font-black uppercase text-white shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  <Mail size={16} /> {editingMember ? 'Actualizar Miembro' : 'Enviar Invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog 
        isOpen={isStatusModalOpen}
        onClose={() => {
          setIsStatusModalOpen(false);
          setMemberToToggle(null);
        }}
        onConfirm={handleConfirmToggleStatus}
        title={memberToToggle?.status === 'active' ? "¿Suspender acceso?" : "¿Reactivar acceso?"}
        description={
          memberToToggle?.status === 'active' 
            ? "El usuario perderá acceso inmediato a la plataforma, pero sus datos históricos se conservarán intactos por seguridad."
            : "El usuario recuperará el acceso a todas las funcionalidades del CRM de forma inmediata."
        }
        confirmText={memberToToggle?.status === 'active' ? "Suspender Acceso" : "Reactivar Acceso"}
        variant={memberToToggle?.status === 'active' ? "warning" : "info"}
      />
    </div>
  );
}
