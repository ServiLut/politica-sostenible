"use client";

import React, { useState, useEffect } from 'react';
import { useCRM, TeamMember } from '@/context/CRMContext';
import { useAuth } from '@/context/auth';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Users, UserPlus, MapPin, X, Mail, Edit, Ban, RotateCcw, ChevronDown, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function OrgPage() {
  const { team, inviteMember, updateMember, toggleMemberStatus, getTeamStats, territory } = useCRM();
  const { role: currentUserRole } = useAuth();
  const { success: toastSuccess } = useToast();
  const { teamEfficiency } = getTeamStats();
  
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showTerritoryDropdown, setShowTerritoryDropdown] = useState(false);
  const [memberToToggle, setMemberToToggle] = useState<TeamMember | null>(null);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);
  
  const [newMember, setNewMember] = useState<Omit<TeamMember, 'id' | 'performance' | 'status'>>({
    name: '',
    role: 'Voluntario',
    territory: '',
    email: ''
  });

  const isAdmin = currentUserRole === 'SuperAdmin' || currentUserRole === 'AdminCampana';

  const existingTerritories = Array.from(new Set([
    ...territory.map(t => t.name),
    ...team.map(m => m.territory)
  ])).filter(Boolean).sort();

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

  const totalPages = Math.ceil(team.length / itemsPerPage);
  const paginatedTeam = team.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    if (isModalOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  return (
    <div className="space-y-8 pr-6 lg:pr-0 pb-10">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Organización y Equipo</h1>
          <p className="text-slate-500 font-medium">Gestión de la estructura jerárquica y nodos operativos.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-teal-600 text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center gap-2"
        >
          <UserPlus size={18} /> Registar Usuario
        </button>
      </div>

      {/* active nodes panel */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
          <p className="text-[10px] font-black text-teal-600 uppercase tracking-[0.2em] mb-2">Eficiencia de Equipo</p>
          <h3 className="text-4xl font-black tracking-tighter mb-4 text-slate-900">{Math.round(teamEfficiency)}%</h3>
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-teal-600 transition-all duration-1000" style={{ width: `${teamEfficiency}%` }}></div>
          </div>
        </div>
        {Object.entries(roleCounts).map(([role, count]) => (
          <div key={role} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{role}s</p>
            <h3 className="text-4xl font-black text-slate-900 tracking-tighter">{count}</h3>
            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Nodos operativos</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm mr-2 lg:mr-0">
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-black text-slate-900 flex items-center gap-2 uppercase text-sm tracking-tighter">
            <Users size={20} className="text-teal-600" /> Miembros de la Campaña
          </h3>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{team.length} Integrantes</span>
        </div>

        {/* Mobile View: Cards */}
        <div className="md:hidden divide-y divide-slate-100">
          {paginatedTeam.map((m) => (
            <div key={m.id} className={cn(
              "p-6 space-y-4",
              m.status === 'suspended' && "bg-slate-50/50 grayscale opacity-70"
            )}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black bg-teal-600/15 text-teal-600 border border-teal-600/20">
                    {m.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-900 uppercase truncate max-w-[150px]">{m.name}</p>
                      {m.status === 'suspended' && (
                        <span className="bg-amber-100 text-amber-700 text-[7px] font-black px-1 py-0.5 rounded uppercase">Susp.</span>
                      )}
                    </div>
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border inline-block mt-1",
                      m.role.includes('Admin') ? "bg-teal-50 text-teal-600 border-teal-100" :
                      m.role.includes('Líder') ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                      "bg-slate-50 text-slate-600 border-slate-100"
                    )}>
                      {m.role}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={() => setExpandedMemberId(expandedMemberId === m.id ? null : m.id)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[8px] font-black uppercase tracking-widest text-slate-600 transition-all flex items-center gap-1.5"
                >
                  {expandedMemberId === m.id ? 'Ocultar' : 'Ver detalles'}
                  <ChevronDown size={12} className={cn("transition-transform", expandedMemberId === m.id && "rotate-180")} />
                </button>
              </div>

              {/* Expanded content */}
              {expandedMemberId === m.id && (
                <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Correo</p>
                      <p className="text-[10px] font-bold text-slate-700 break-all">{m.email}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Territorio</p>
                      <p className="text-[10px] font-bold text-slate-700 flex items-center gap-1">
                        <MapPin size={10} className="text-teal-500" /> {m.territory}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Rendimiento</p>
                      <span className="text-[8px] font-black text-slate-600">{m.performance}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={cn(
                          "h-full transition-all duration-1000",
                          m.performance > 80 ? "bg-emerald-500" : m.performance > 50 ? "bg-amber-500" : "bg-rose-500"
                        )} 
                        style={{ width: `${m.performance}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button 
                      onClick={() => handleEdit(m)}
                      className="flex-1 py-3 bg-teal-50 text-teal-600 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
                    >
                      <Edit size={14} /> Editar
                    </button>
                    {isAdmin && (
                      <button 
                        onClick={() => handleToggleStatusClick(m)}
                        className={cn(
                          "flex-1 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-2",
                          m.status === 'active' ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                        )}
                      >
                        {m.status === 'active' ? <><Ban size={14} /> Suspender</> : <><RotateCcw size={14} /> Reactivar</>}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Desktop View: Table */}
        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">
              <tr>
                <th className="px-8 py-5">Integrante</th>
                <th className="px-8 py-5">Rol</th>
                <th className="px-8 py-5">Territorio</th>
                <th className="px-8 py-5">Rendimiento</th>
                <th className="px-8 py-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginatedTeam.map((m) => (
                <tr key={m.id} className={cn(
                  "hover:bg-slate-50/50 transition-colors group",
                  m.status === 'suspended' && "opacity-50 grayscale"
                )}>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black shadow-sm transition-all border shrink-0 bg-teal-600/15 text-teal-600 border-teal-600/20">
                        {m.name.charAt(0)}
                        {m.status === 'suspended' && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center">
                            <Ban size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-slate-900 uppercase">{m.name}</p>
                          {m.status === 'suspended' && (
                            <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-widest uppercase">
                              Suspendido
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 lowercase">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border",
                      m.role.includes('Admin') ? "bg-teal-50 text-teal-600 border-teal-100" :
                      m.role.includes('Líder') ? "bg-emerald-50 text-emerald-600 border-emerald-100" :
                      "bg-slate-50 text-slate-600 border-slate-100"
                    )}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-teal-500" /> {m.territory}
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            m.performance > 80 ? "bg-emerald-500" : m.performance > 50 ? "bg-amber-500" : "bg-rose-500"
                          )} 
                          style={{ width: `${m.performance}%` }}
                        ></div>
                      </div>
                      <span className="text-[10px] font-black text-slate-400">{m.performance}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(m)}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all"
                      >
                        <Edit size={16} />
                      </button>
                      {isAdmin && (
                        <button 
                          onClick={() => handleToggleStatusClick(m)}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            m.status === 'active' ? "text-slate-400 hover:text-amber-600 hover:bg-amber-50" : "text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"
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

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="px-8 py-6 border-t border-slate-50 bg-slate-50/30 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Página
              </p>
              <input
                key={currentPage}
                type="number"
                min="1"
                max={totalPages}
                defaultValue={currentPage}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = parseInt((e.target as HTMLInputElement).value);
                    if (val >= 1 && val <= totalPages) {
                      setCurrentPage(val);
                    }
                  }
                }}
                className="w-12 h-8 bg-white border-2 border-slate-100 rounded-lg text-center text-xs font-black text-teal-600 focus:border-teal-500 outline-none transition-all"
              />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                de {totalPages}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-teal-600 disabled:opacity-30 transition-all shadow-sm"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {isModalOpen && (
              <div 
                className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={closeModal}
              >
                <div 
                  className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 relative"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="px-10 py-10 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-[3rem]">
                    <div>
                      <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
                        {editingMember ? 'Editar Perfil' : 'Registar Usuario'}
                      </h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">Crecimiento de la Estructura</p>
                    </div>
                    <button onClick={closeModal} className="text-slate-400 hover:text-rose-500 bg-slate-50 p-3 rounded-2xl transition-all"><X size={20} /></button>
                  </div>
                  <form onSubmit={handleSubmit} className="p-10 space-y-6">
                    <div className="space-y-5">
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Nombre Completo</label>
                        <input required placeholder="Ej: Diana Sánchez" className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" value={newMember.name} onChange={e => setNewMember({...newMember, name: e.target.value})} />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Correo Institucional</label>
                        <input required type="email" placeholder="email@campana.com" className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all" value={newMember.email} onChange={e => setNewMember({...newMember, email: e.target.value})} />
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="relative">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Rol Operativo</label>
                          <button
                            type="button"
                            className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-white hover:border-slate-100 transition-all focus:border-teal-500 outline-none"
                            onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                            onBlur={() => setTimeout(() => setShowRoleDropdown(false), 200)}
                          >
                            <span className="text-slate-900">{newMember.role}</span>
                            <ChevronDown size={16} className={cn("text-slate-400 transition-transform", showRoleDropdown && "rotate-180")} />
                          </button>
                          
                          {showRoleDropdown && (
                            <div className="absolute z-[60] w-full bottom-full mb-2 bg-white rounded-[1.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 p-1.5">
                              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                {['Admin Campaña', 'Coordinador', 'Líder Territorial', 'Voluntario', 'Testigo'].map(role => (
                                  <button
                                    key={role}
                                    type="button"
                                    className={cn(
                                      "w-full px-4 py-2.5 text-left text-sm rounded-xl transition-all flex items-center justify-between group",
                                      newMember.role === role ? "bg-teal-50 text-teal-600" : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                                    )}
                                    onClick={() => {
                                      setNewMember({...newMember, role});
                                      setShowRoleDropdown(false);
                                    }}
                                  >
                                    <span className="font-bold">{role}</span>
                                    {newMember.role === role && <Check size={14} className="text-teal-600" />}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2 px-1">Territorio</label>
                          <button
                            type="button"
                            className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-white hover:border-slate-100 transition-all focus:border-teal-500 outline-none"
                            onClick={() => setShowTerritoryDropdown(!showTerritoryDropdown)}
                            onBlur={() => setTimeout(() => setShowTerritoryDropdown(false), 200)}
                          >
                            <span className="text-slate-900">{newMember.territory || 'Seleccione...'}</span>
                            <ChevronDown size={16} className={cn("text-slate-400 transition-transform", showTerritoryDropdown && "rotate-180")} />
                          </button>
                          
                          {showTerritoryDropdown && (
                            <div className="absolute z-[60] w-full bottom-full mb-2 bg-white rounded-[1.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 p-1.5">
                              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                {existingTerritories.length > 0 ? (
                                  existingTerritories.map(t => (
                                    <button
                                      key={t}
                                      type="button"
                                      className={cn(
                                        "w-full px-4 py-2.5 text-left text-sm rounded-xl transition-all flex items-center justify-between group",
                                        newMember.territory === t ? "bg-teal-50 text-teal-600" : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                                      )}
                                      onClick={() => {
                                        setNewMember({...newMember, territory: t});
                                        setShowTerritoryDropdown(false);
                                      }}
                                    >
                                      <span className="font-bold">{t}</span>
                                      {newMember.territory === t && <Check size={14} className="text-teal-600" />}
                                    </button>
                                  ))
                                ) : (
                                  <div className="px-4 py-3 text-xs text-slate-400 font-bold italic">
                                    No hay territorios configurados.
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="pt-6 flex gap-4">
                      <button type="button" onClick={closeModal} className="flex-1 px-4 py-4 bg-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all">Cancelar</button>
                      <button type="submit" className="flex-1 px-4 py-4 bg-teal-600 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white shadow-xl shadow-teal-100 hover:bg-teal-700 transition-all flex items-center justify-center gap-2">
                        <Mail size={16} /> {editingMember ? 'Actualizar Perfil' : 'Enviar Credenciales'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )
      }

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
