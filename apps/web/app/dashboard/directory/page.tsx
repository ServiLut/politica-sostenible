"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useCRM, Contact, ContactRole, PipelineStage } from '@/context/CRMContext';
import { useToast } from '@/context/ToastContext';
import { AlertDialog } from '@/components/ui/AlertDialog';
import * as XLSX from 'xlsx';
import { 
  UserPlus, 
  Search, 
  Filter, 
  FileSpreadsheet, 
  Pencil, 
  RotateCcw,
  X,
  MapPin,
  Shield,
  Ban,
  ArrowLeft,
  ChevronDown,
  Check
} from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function DirectoryPage() {
  const { contacts, territory, addContact, updateContact, toggleContactStatus } = useCRM();
  const { success: toastSuccess } = useToast();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [currentContact, setCurrentContact] = useState<Contact | null>(null);
  const [contactToToggle, setContactToToggle] = useState<Contact | null>(null);
  
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('');
  const [showNeighborhoodDropdown, setShowNeighborhoodDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [showStageDropdown, setShowStageDropdown] = useState(false);

  const [formData, setFormData] = useState<Omit<Contact, 'id' | 'createdAt' | 'status'>>({
    name: '',
    cedula: '',
    phone: '',
    address: '',
    neighborhood: '',
    role: 'Simpatizante',
    stage: 'Prospecto'
  });

  const filteredNeighborhoods = territory.filter(zone => 
    zone.name.toLowerCase().includes(neighborhoodSearch.toLowerCase())
  );

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cedula.includes(searchTerm) ||
    c.neighborhood.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenDialog = (contact?: Contact) => {
    if (contact) {
      setCurrentContact(contact);
      setFormData({
        name: contact.name,
        cedula: contact.cedula,
        phone: contact.phone,
        address: contact.address,
        neighborhood: contact.neighborhood,
        role: contact.role,
        stage: contact.stage
      });
      setNeighborhoodSearch(contact.neighborhood);
    } else {
      setCurrentContact(null);
      setFormData({
        name: '',
        cedula: '',
        phone: '',
        address: '',
        neighborhood: '',
        role: 'Simpatizante',
        stage: 'Prospecto'
      });
      setNeighborhoodSearch('');
    }
    setIsDialogOpen(true);
  };

  const closeModal = () => {
    setIsDialogOpen(false);
    setCurrentContact(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentContact) {
      updateContact(currentContact.id, formData);
      toastSuccess("Contacto actualizado correctamente");
    } else {
      addContact(formData);
      toastSuccess("Contacto añadido al directorio");
    }
    closeModal();
  };

  const handleToggleStatusClick = (contact: Contact) => {
    if (contact.status === 'archived') {
      toggleContactStatus(contact.id);
      toastSuccess("Acceso reactivado correctamente");
    } else {
      setContactToToggle(contact);
      setIsStatusModalOpen(true);
    }
  };

  const confirmToggleStatus = () => {
    if (contactToToggle) {
      toggleContactStatus(contactToToggle.id);
      toastSuccess("Acceso suspendido correctamente");
      setContactToToggle(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    if (isDialogOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDialogOpen]);

  const handleExport = () => {
    if (contacts.length === 0) {
      toastSuccess("No hay datos para exportar");
      return;
    }

    const data = contacts.map(c => ({
      "Nombre Completo": c.name,
      "Cédula": c.cedula,
      "Teléfono": c.phone,
      "Dirección": c.address,
      "Barrio": c.neighborhood,
      "Rol Político": c.role,
      "Etapa Pipeline": c.stage,
      "Estado": c.status === 'active' ? 'Activo' : 'Archivado',
      "Fecha Registro": new Date(c.createdAt).toLocaleDateString()
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Directorio");
    XLSX.writeFile(wb, `directorio_politica_sostenible_${new Date().toISOString().split('T')[0]}.xlsx`);
    toastSuccess("Excel generado correctamente");
  };

  return (
    <div className="space-y-8 pb-32">
      {/* Back Navigation */}
      <div className="px-2">
        <Link 
          href="/dashboard/executive" 
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-teal-600 hover:border-teal-200 transition-all shadow-sm group"
        >
          <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
          Regresar al Centro de Mando
        </Link>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">Directorio CRM</h1>
          <p className="text-slate-500 font-medium">Base de datos unificada de simpatizantes y estructura.</p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <button 
            onClick={handleExport}
            className="flex-1 md:flex-none bg-emerald-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
          >
            <FileSpreadsheet size={18} /> Exportar Excel
          </button>
          <button 
            onClick={() => handleOpenDialog()}
            className="flex-1 md:flex-none bg-teal-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-teal-200 hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
          >
            <UserPlus size={18} /> Nuevo Contacto
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text"
            placeholder="Buscar por nombre, cédula o barrio..."
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border-none rounded-2xl text-sm font-bold focus:ring-2 focus:ring-teal-500 transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="px-6 py-3 bg-slate-50 text-slate-600 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-100 transition-all">
          <Filter size={18} /> Filtros Avanzados
        </button>
      </div>

      <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm">
        {/* Mobile Card View */}
        <div className="block md:hidden divide-y divide-slate-50">
          {filteredContacts.map((contact) => (
            <div key={contact.id} className={cn(
              "p-6 space-y-4 overflow-hidden",
              contact.status === 'archived' && "opacity-60 grayscale bg-slate-50"
            )}>
              <div className="flex justify-between items-start gap-4">
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  <div className="w-12 h-12 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center font-black text-lg border border-teal-100 shrink-0">
                    {contact.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-black text-black uppercase tracking-tight leading-tight mb-1 whitespace-normal break-words max-w-[200px] md:max-w-none">
                      {contact.name}
                    </p>
                    <p className="text-xs font-bold text-slate-400 truncate">{contact.cedula}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleOpenDialog(contact)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-teal-600 transition-all"><Pencil size={18} /></button>
                  <button onClick={() => handleToggleStatusClick(contact)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-amber-600 transition-all"><Ban size={18} /></button>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-1 min-w-0">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Rol Político</p>
                  <span className="text-[10px] font-black text-teal-600 bg-teal-50 px-2.5 py-1 rounded-lg uppercase border border-teal-100 inline-block truncate max-w-full">
                    {contact.role}
                  </span>
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Etapa Pipeline</p>
                  <span className="text-[10px] font-black text-slate-600 bg-slate-100 px-2.5 py-1 rounded-lg uppercase inline-block truncate max-w-full">
                    {contact.stage}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 text-slate-600 bg-slate-50 p-3 rounded-2xl border border-slate-100 overflow-hidden">
                <MapPin size={14} className="text-teal-600 shrink-0" />
                <p className="text-xs font-bold uppercase tracking-wide whitespace-normal break-words flex-1 min-w-0">{contact.neighborhood}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Votante</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Identificación</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Rol / Etapa</th>
                <th className="px-8 py-5 text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Ubicación</th>
                <th className="px-8 py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredContacts.map((contact) => (
                <tr key={contact.id} className={cn(
                  "hover:bg-slate-50/50 transition-colors group",
                  contact.status === 'archived' && "opacity-50 grayscale bg-slate-50"
                )}>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-teal-50 text-teal-600 rounded-2xl flex items-center justify-center font-black text-sm border border-teal-100 shadow-inner relative">
                        {contact.name.charAt(0)}
                        {contact.status === 'archived' && (
                          <div className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 rounded-full border-2 border-white flex items-center justify-center">
                            <Ban size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 max-w-[250px]">
                        <div className="flex flex-col gap-0.5">
                          <p className="text-sm font-black text-black uppercase break-words whitespace-normal leading-tight">
                            {contact.name}
                          </p>
                          {contact.status === 'archived' && (
                            <span className="bg-amber-100 text-amber-700 text-[8px] font-black px-1.5 py-0.5 rounded-md tracking-widest uppercase w-fit mt-1">
                              Suspendido
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-slate-400 mt-1">{contact.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-sm font-bold text-slate-600">
                    {contact.cedula}
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-teal-600 uppercase tracking-tighter">
                        {contact.role}
                      </span>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">
                        {contact.stage}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-1 text-xs font-bold text-slate-500 max-w-[200px]">
                      <MapPin size={12} className="text-slate-300 shrink-0" /> 
                      <span className="whitespace-normal break-words leading-tight uppercase text-[10px]">
                        {contact.neighborhood}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => handleOpenDialog(contact)}
                        className="p-2 text-slate-400 hover:text-teal-600 hover:bg-teal-50 rounded-xl transition-all"
                      >
                        <Pencil size={16} />
                      </button>
                      <button 
                        onClick={() => handleToggleStatusClick(contact)}
                        className={cn(
                          "p-2 rounded-xl transition-all",
                          contact.status === 'active' ? "text-slate-400 hover:text-amber-600 hover:bg-amber-50" : "text-emerald-400 hover:text-emerald-600 hover:bg-emerald-50"
                        )}
                      >
                        {contact.status === 'active' ? <Ban size={16} /> : <RotateCcw size={16} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contact Modal */}
      {isDialogOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4"
          onClick={closeModal}
        >
          <div 
            className="bg-white w-full max-w-2xl rounded-[2rem] md:rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-200 max-h-[95vh] flex flex-col relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 md:px-10 py-6 md:py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0 rounded-t-[2rem] md:rounded-t-[3rem]">
              <div>
                <h3 className="text-xl md:text-2xl font-black text-slate-900 tracking-tighter">
                  {currentContact ? 'Editar Contacto' : 'Nuevo Registro'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestión de Base de Datos</p>
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 md:p-10 space-y-4 md:space-y-6 overflow-visible custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Nombre Completo</label>
                  <input 
                    required 
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Cédula / ID</label>
                  <input 
                    required 
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                    value={formData.cedula}
                    onChange={(e) => setFormData({...formData, cedula: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Teléfono</label>
                  <input 
                    required 
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Barrio / Comuna</label>
                  <div className="relative">
                    <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      required 
                      placeholder="Buscar barrio o comuna..."
                      className="w-full pl-12 pr-5 py-3 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                      value={neighborhoodSearch}
                      onChange={(e) => {
                        setNeighborhoodSearch(e.target.value);
                        setFormData({...formData, neighborhood: e.target.value});
                        setShowNeighborhoodDropdown(true);
                      }}
                      onFocus={() => setShowNeighborhoodDropdown(true)}
                      onBlur={() => setTimeout(() => setShowNeighborhoodDropdown(false), 200)}
                    />
                  </div>
                  
                  {showNeighborhoodDropdown && (
                    <div className="absolute z-50 w-full mt-2 bg-white rounded-2xl border border-slate-100 shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                      <div className="max-h-48 overflow-y-auto">
                        {filteredNeighborhoods.length > 0 ? (
                          filteredNeighborhoods.map(zone => (
                            <button
                              key={zone.id}
                              type="button"
                              className="w-full px-4 py-3 text-left text-sm hover:bg-teal-50 hover:text-teal-600 transition-all flex items-center justify-between group"
                              onClick={() => {
                                setFormData({...formData, neighborhood: zone.name});
                                setNeighborhoodSearch(zone.name);
                                setShowNeighborhoodDropdown(false);
                              }}
                            >
                              <span className="font-bold">{zone.name}</span>
                              <span className="text-[10px] font-black text-slate-400 group-hover:text-teal-400 uppercase">Zona</span>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-xs text-slate-400 font-bold italic">
                            No se encontraron zonas.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Rol Político</label>
                  <button
                    type="button"
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-white hover:border-slate-100 transition-all focus:border-teal-500 outline-none"
                    onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                    onBlur={() => setTimeout(() => setShowRoleDropdown(false), 200)}
                  >
                    <span className="text-slate-900">{formData.role}</span>
                    <ChevronDown size={16} className={cn("text-slate-400 transition-transform", showRoleDropdown && "rotate-180")} />
                  </button>
                  
                  {showRoleDropdown && (
                    <div className="absolute z-[60] w-full bottom-full mb-2 bg-white rounded-[1.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 p-1.5">
                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        {(['Simpatizante', 'Líder', 'Voluntario', 'Testigo', 'Donante'] as ContactRole[]).map(role => (
                          <button
                            key={role}
                            type="button"
                            className={cn(
                              "w-full px-4 py-2.5 text-left text-sm rounded-xl transition-all flex items-center justify-between group",
                              formData.role === role ? "bg-teal-50 text-teal-600" : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                            )}
                            onClick={() => {
                              setFormData({...formData, role});
                              setShowRoleDropdown(false);
                            }}
                          >
                            <span className="font-bold">{role}</span>
                            {formData.role === role && <Check size={14} className="text-teal-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="space-y-2 relative">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Etapa de Conversión</label>
                  <button
                    type="button"
                    className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold flex items-center justify-between hover:bg-white hover:border-slate-100 transition-all focus:border-teal-500 outline-none"
                    onClick={() => setShowStageDropdown(!showStageDropdown)}
                    onBlur={() => setTimeout(() => setShowStageDropdown(false), 200)}
                  >
                    <span className="text-slate-900">{formData.stage}</span>
                    <ChevronDown size={16} className={cn("text-slate-400 transition-transform", showStageDropdown && "rotate-180")} />
                  </button>
                  
                  {showStageDropdown && (
                    <div className="absolute z-[60] w-full bottom-full mb-2 bg-white rounded-[1.5rem] border border-slate-100 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 p-1.5">
                      <div className="max-h-40 overflow-y-auto custom-scrollbar">
                        {(['Prospecto', 'Contactado', 'Simpatizante', 'Firme', 'Votó'] as PipelineStage[]).map(stage => (
                          <button
                            key={stage}
                            type="button"
                            className={cn(
                              "w-full px-4 py-2.5 text-left text-sm rounded-xl transition-all flex items-center justify-between group",
                              formData.stage === stage ? "bg-teal-50 text-teal-600" : "hover:bg-slate-50 text-slate-600 hover:text-slate-900"
                            )}
                            onClick={() => {
                              setFormData({...formData, stage});
                              setShowStageDropdown(false);
                            }}
                          >
                            <span className="font-bold">{stage}</span>
                            {formData.stage === stage && <Check size={14} className="text-teal-600" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block">Dirección de Residencia</label>
                <input 
                  required 
                  className="w-full px-5 py-3 bg-slate-50 border-2 border-transparent rounded-2xl text-sm font-bold focus:border-teal-500 focus:bg-white outline-none transition-all"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                />
              </div>

              <div className="pt-6 flex flex-col md:flex-row gap-3 md:gap-4 shrink-0 pb-2">
                <button 
                  type="button" 
                  onClick={closeModal}
                  className="w-full md:flex-1 px-8 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase text-slate-500 hover:bg-slate-50 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="w-full md:flex-1 px-8 py-4 bg-teal-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-teal-200 hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
                >
                  <Shield size={16} /> {currentContact ? 'Guardar Cambios' : 'Registrar Votante'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AlertDialog 
        isOpen={isStatusModalOpen}
        onClose={() => { setIsStatusModalOpen(false); setContactToToggle(null); }}
        onConfirm={confirmToggleStatus}
        title={contactToToggle?.status === 'active' ? "¿Suspender contacto?" : "¿Reactivar contacto?"}
        description={
          contactToToggle?.status === 'active' 
            ? "El contacto se ocultará de las listas operativas, pero su historial y datos se conservarán para auditoría política."
            : "El contacto volverá a aparecer en las listas operativas y el pipeline de inmediato."
        }
        confirmText={contactToToggle?.status === 'active' ? "Suspender Contacto" : "Reactivar Contacto"}
        variant={contactToToggle?.status === 'active' ? "warning" : "info"}
      />
    </div>
  );
}
