"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Shield,
  MapPin,
  UserX,
  Lock,
  User,
  Edit2,
  RotateCcw,
  X,
  Save,
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
} from "lucide-react";
import { toast } from "sonner";
import { toggleUserStatus, updateUser, getUsers } from "@/app/actions/team";

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [territories, setTerritories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create Form State
  const [formData, setFormData] = useState({
    fullName: "",
    role: "LEADER",
    pin: "",
    email: "",
    territoryId: "",
    reportsToId: "",
  });

  // Edit State
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({
    id: "",
    fullName: "",
    role: "",
    email: "",
    territoryId: "",
    pin: "",
    reportsToId: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, tRes] = await Promise.all([
        getUsers({ page: currentPage, query: search, role: roleFilter }),
        fetch("/api/territory/list"),
      ]);

      setUsers(userData.users);
      setTotalPages(userData.totalPages);
      setTotalCount(userData.totalCount);

      if (tRes.ok) setTerritories(await tRes.json());
    } catch (e) {
      console.error(e);
      toast.error("Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, [currentPage, search, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter]);

  const getEligibleSuperiors = (targetRole: string) => {
    return users.filter((u) => {
      if (!u.isActive) return false;
      if (targetRole === "TESTIGO")
        return u.role === "LEADER" || u.role === "COORDINATOR";
      if (targetRole === "LEADER") return u.role === "COORDINATOR";
      if (targetRole === "COORDINATOR") return u.role === "ADMIN";
      return false;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.pin.length !== 4 || isNaN(Number(formData.pin))) {
      toast.warning("PIN Inválido", {
        description: "El PIN debe tener 4 dígitos numéricos exactos.",
      });
      return;
    }
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");

      toast.success("Usuario Creado", {
        description: `${formData.fullName} ha sido dado de alta.`,
      });
      setFormData({
        fullName: "",
        role: "LEADER",
        pin: "",
        email: "",
        territoryId: "",
        reportsToId: "",
      });
      fetchData();
    } catch (err: any) {
      toast.error("Error de Creación", { description: err.message });
    }
  };

  const handleToggleStatus = async (user: any) => {
    const newStatus = !user.isActive;
    const actionLabel = newStatus ? "Reactivar" : "Desactivar";

    toast(`¿Confirmar ${actionLabel}?`, {
      description: `Estás a punto de ${newStatus ? "dar acceso nuevamente" : "revocar el acceso"} a ${user.fullName}.`,
      action: {
        label: `Confirmar ${actionLabel}`,
        onClick: async () => {
          const res = await toggleUserStatus(user.id, newStatus);
          if (res.success) {
            toast.success(res.message);
            fetchData();
          } else {
            toast.error("Error", { description: res.error });
          }
        },
      },
    });
  };

  const openEditModal = (user: any) => {
    setEditingUser(user);
    setEditFormData({
      id: user.id,
      fullName: user.fullName,
      role: user.role,
      email: user.email || "",
      territoryId: user.territoryId || "",
      pin: "",
      reportsToId: user.reportsToId || "",
    });
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      editFormData.pin &&
      (editFormData.pin.length !== 4 || isNaN(Number(editFormData.pin)))
    ) {
      toast.warning("PIN Inválido", {
        description: "Si decides cambiar el PIN, debe tener 4 dígitos.",
      });
      return;
    }

    const res = await updateUser(editFormData.id, editFormData);
    if (res.success) {
      toast.success("Usuario Actualizado");
      setEditModalOpen(false);
      fetchData();
    } else {
      toast.error("Error de Edición", { description: res.error });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12 relative">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-brand-black tracking-tight">
            Gestión de Equipo
          </h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-widest mt-1">
            Control de acceso y jerarquía de personal
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          <div className="card-friendly p-8 sticky top-6">
            <h3 className="font-black text-brand-black mb-8 flex items-center gap-3 text-sm uppercase tracking-widest">
              <div className="p-2.5 bg-brand-black text-white rounded-xl shadow-lg shadow-brand-black/20">
                <UserPlus className="w-5 h-5" />
              </div>
              Alta de Personal
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black transition-all"
                  placeholder="Ej. María Rodríguez"
                  value={formData.fullName}
                  onChange={(e) =>
                    setFormData({ ...formData, fullName: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Correo de Recuperación
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black transition-all pl-12"
                    placeholder="usuario@ejemplo.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        email: e.target.value,
                      })
                    }
                  />
                  <Mail className="w-4 h-4 text-brand-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                </div>
                <p className="text-[9px] text-brand-gray-400 font-bold ml-1">
                  Obligatorio para recuperación de contraseña.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Rol Jerárquico
                </label>
                <div className="relative">
                  <select
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black appearance-none"
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        role: e.target.value,
                        reportsToId: "",
                      })
                    }
                  >
                    <option value="LEADER">Líder (Captura)</option>
                    <option value="COORDINATOR">
                      Coordinador (Territorio)
                    </option>
                    <option value="ADMIN">Administrador (Total)</option>
                    <option value="TESTIGO">Testigo E-14</option>
                  </select>
                  <Shield className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Jefe Inmediato / Reporta a
                </label>
                <div className="relative">
                  <select
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black appearance-none"
                    value={formData.reportsToId}
                    onChange={(e) =>
                      setFormData({ ...formData, reportsToId: e.target.value })
                    }
                  >
                    <option value="">-- Sin Jefe Directo --</option>
                    {getEligibleSuperiors(formData.role).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                  <User className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                <p className="text-[9px] text-brand-gray-400 font-bold ml-1">
                  Opcional. Define quién supervisa a este usuario.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Territorio Base
                </label>
                <div className="relative">
                  <select
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black appearance-none"
                    value={formData.territoryId}
                    onChange={(e) =>
                      setFormData({ ...formData, territoryId: e.target.value })
                    }
                  >
                    <option value="">-- Sin Zona --</option>
                    {territories.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <MapPin className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  PIN Maestro (4 dígitos)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    maxLength={4}
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-black text-center text-xl tracking-[0.5em] transition-all"
                    placeholder="****"
                    value={formData.pin}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        pin: e.target.value.replace(/[^0-9]/g, ""),
                      })
                    }
                  />
                  <Lock className="w-4 h-4 text-brand-gray-400 absolute left-4 top-1/2 -translate-y-1/2 opacity-30" />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary-friendly w-full py-4 uppercase tracking-widest text-xs shadow-xl shadow-brand-black/10"
              >
                Crear Usuario
              </button>
            </form>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h3 className="font-black text-brand-black text-[10px] uppercase tracking-[0.2em] px-2 flex items-center justify-between gap-4">
              Directorio de Personal
              <span className="bg-brand-gray-100 text-brand-gray-500 px-3 py-1 rounded-full">
                {totalCount} Miembros
              </span>
            </h3>

            <div className="flex gap-2 w-full md:w-auto">
              <select
                className="bg-white border border-brand-gray-200 text-[10px] font-bold uppercase rounded-lg p-2 focus:border-brand-black outline-none"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              >
                <option value="">Todos los Roles</option>
                <option value="ADMIN">Administradores</option>
                <option value="COORDINATOR">Coordinadores</option>
                <option value="LEADER">Líderes</option>
                <option value="TESTIGO">Testigos</option>
              </select>

              <div className="relative flex-1 md:w-48">
                <input
                  type="text"
                  className="w-full bg-white border border-brand-gray-200 text-xs font-bold rounded-lg pl-8 pr-2 py-2 focus:border-brand-black outline-none"
                  placeholder="Buscar..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <Search className="w-3 h-3 text-brand-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            {loading ? (
              <div className="text-center py-20 text-brand-gray-400 font-bold uppercase text-xs tracking-widest animate-pulse italic flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                Consultando estructura de equipo...
              </div>
            ) : users.length > 0 ? (
              users.map((u) => (
                <div
                  key={u.id}
                  className={`card-friendly p-5 flex flex-col md:flex-row md:items-center justify-between gap-6 transition-all group hover:bg-brand-green-50/20 ${u.isActive ? "" : "opacity-60 grayscale hover:grayscale-0"}`}
                >
                  <div className="flex items-center gap-5">
                    <div
                      className={`w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl shadow-lg transition-colors group-hover:scale-105 ${u.isActive ? "bg-brand-black text-white" : "bg-brand-gray-200 text-brand-gray-500"}`}
                    >
                      {(u.fullName || "U").charAt(0)}
                    </div>
                    <div>
                      <h4
                        className={`font-black text-base tracking-tight ${u.isActive ? "text-brand-black" : "text-brand-gray-400"}`}
                      >
                        {u.fullName || "Usuario sin nombre"}
                        {!u.isActive && (
                          <span className="ml-2 text-[9px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full uppercase tracking-widest">
                            Inactivo
                          </span>
                        )}
                      </h4>
                      <div className="flex flex-col mt-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider border ${
                              u.role === "ADMIN"
                                ? "bg-brand-black text-white border-brand-black"
                                : u.role === "COORDINATOR"
                                  ? "bg-brand-green-100 text-brand-green-700 border-brand-green-200"
                                  : "bg-brand-gray-100 text-brand-gray-600 border-brand-gray-200"
                            }`}
                          >
                            {u.role}
                          </span>
                          {u.territories && (
                            <span className="flex items-center gap-1.5 text-[10px] font-bold text-brand-gray-400 uppercase tracking-tighter">
                              <MapPin className="w-3 h-3 text-brand-green-500" />{" "}
                              {u.territories}
                            </span>
                          )}
                        </div>

                        <div className="text-[10px] text-brand-gray-500 mt-1.5 font-bold uppercase tracking-tight">
                          {u.reportsTo ? (
                            <span className="flex items-center gap-1.5 bg-brand-gray-50 px-2 py-1 rounded-md border border-brand-gray-100 w-fit">
                              <User className="w-3 h-3 text-brand-gray-400" />
                              Reporta a:{" "}
                              <strong className="text-brand-black">
                                {u.reportsTo.fullName}
                              </strong>
                            </span>
                          ) : (
                            <span className="text-brand-gray-300 italic px-2">
                              -- Sin Supervisor Directo --
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end md:self-auto">
                    <button
                      onClick={() => openEditModal(u)}
                      className="w-10 h-10 flex items-center justify-center bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all"
                      title="Editar"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {u.isActive ? (
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className="px-5 py-2.5 bg-white border-2 border-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-50 hover:border-red-100 transition-all shadow-sm flex items-center gap-2"
                      >
                        <UserX className="w-3 h-3" /> Desactivar
                      </button>
                    ) : (
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className="px-5 py-2.5 bg-brand-green-50 text-brand-green-600 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 border-brand-green-100 flex items-center gap-2 hover:bg-brand-green-100 transition-all"
                      >
                        <RotateCcw className="w-3 h-3" /> Reactivar
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-20 card-friendly bg-brand-gray-50 border-dashed">
                <p className="text-brand-gray-400 font-bold italic">
                  No hay miembros registrados.
                </p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-brand-gray-100">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-2 rounded-lg hover:bg-brand-gray-100 disabled:opacity-30 transition-all text-brand-gray-600"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400">
                  Página {currentPage} de {totalPages}
                </span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  className="p-2 rounded-lg hover:bg-brand-gray-100 disabled:opacity-30 transition-all text-brand-gray-600"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="bg-brand-gray-50 px-6 py-4 border-b border-brand-gray-100 flex justify-between items-center">
              <div>
                <h3 className="font-black text-brand-black uppercase text-sm tracking-widest">
                  Editar Perfil
                </h3>
                <p className="text-[10px] font-bold text-brand-gray-400 mt-1">
                  Actualizando datos de usuario
                </p>
              </div>
              <button
                onClick={() => setEditModalOpen(false)}
                className="p-2 hover:bg-brand-gray-200 rounded-full transition-colors text-brand-gray-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black"
                  value={editFormData.fullName}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      fullName: e.target.value,
                    })
                  }
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Correo de Recuperación
                </label>
                <div className="relative">
                  <input
                    type="email"
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black transition-all pl-12"
                    placeholder="usuario@ejemplo.com"
                    value={editFormData.email}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        email: e.target.value,
                      })
                    }
                  />
                  <Mail className="w-4 h-4 text-brand-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Rol Jerárquico
                </label>
                <div className="relative">
                  <select
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black appearance-none"
                    value={editFormData.role}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, role: e.target.value })
                    }
                  >
                    <option value="LEADER">Líder (Captura)</option>
                    <option value="COORDINATOR">
                      Coordinador (Territorio)
                    </option>
                    <option value="ADMIN">Administrador (Total)</option>
                    <option value="TESTIGO">Testigo E-14</option>
                  </select>
                  <Shield className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Jefe Inmediato / Reporta a
                </label>
                <div className="relative">
                  <select
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black appearance-none"
                    value={editFormData.reportsToId}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        reportsToId: e.target.value,
                      })
                    }
                  >
                    <option value="">-- Sin Jefe Directo --</option>
                    {getEligibleSuperiors(editFormData.role).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.role})
                      </option>
                    ))}
                  </select>
                  <User className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">
                  Territorio Base
                </label>
                <div className="relative">
                  <select
                    className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none font-bold text-brand-black appearance-none"
                    value={editFormData.territoryId}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        territoryId: e.target.value,
                      })
                    }
                  >
                    <option value="">-- Sin Zona --</option>
                    {territories.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <MapPin className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1 text-blue-600">
                  Nuevo PIN (Opcional)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={4}
                    className="w-full p-3.5 bg-blue-50 border-2 border-blue-100 rounded-2xl focus:border-blue-500 focus:bg-white outline-none font-black text-center text-xl tracking-[0.5em] transition-all placeholder-blue-200 text-blue-900"
                    placeholder="****"
                    value={editFormData.pin}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        pin: e.target.value.replace(/[^0-9]/g, ""),
                      })
                    }
                  />
                  <Lock className="w-4 h-4 text-blue-300 absolute left-4 top-1/2 -translate-y-1/2 opacity-50" />
                </div>
                <p className="text-[10px] text-brand-gray-400 font-bold ml-1">
                  Dejar vacío para mantener el actual.
                </p>
              </div>

              <button
                type="submit"
                className="btn-primary-friendly w-full py-4 uppercase tracking-widest text-xs shadow-xl shadow-brand-black/10 flex items-center justify-center gap-2"
              >
                <Save className="w-4 h-4" /> Guardar Cambios
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
