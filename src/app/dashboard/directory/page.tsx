'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Phone, User, Calendar, MessageCircle, AlertCircle, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { getContacts } from '@/app/actions/contacts';
import { toast } from 'sonner';

export default function DirectoryPage() {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<any[]>([]);
  const [territories, setTerritories] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [selectedTerritory, setSelectedTerritory] = useState('');
  const [selectedLeader, setSelectedLeader] = useState('');
  const [votedStatus, setVotedStatus] = useState(''); // '', 'true', 'false'
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const fetchContactsData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getContacts({
          page: currentPage,
          limit: 20,
          query: query,
          territoryId: selectedTerritory,
          leaderId: selectedLeader,
          voted: votedStatus
      });
      
      setContacts(data.contacts);
      setTotalPages(data.totalPages);
      setTotalCount(data.totalCount);

    } catch (error) { console.error(error); }
    finally { setLoading(false); }
  }, [currentPage, query, selectedTerritory, selectedLeader, votedStatus]);

  const fetchTerritories = useCallback(async () => {
    const res = await fetch('/api/territory/list');
    if (res.ok) setTerritories(await res.json());
  }, []);

  const fetchLeaders = useCallback(async () => {
      try {
          const res = await fetch('/api/users');
          if (res.ok) setLeaders(await res.json());
      } catch (e) { console.error('Error fetching leaders', e); }
  }, []);

  const getWhatsAppLink = (phone: string, name: string) => {
    const message = encodeURIComponent(`Hola ${name}, gracias por sumarte a la victoria.`);
    const cleanPhone = phone.replace(/\D/g, ''); 
    const finalPhone = cleanPhone.length === 10 ? `57${cleanPhone}` : cleanPhone;
    return `https://wa.me/${finalPhone}?text=${message}`;
  };

  const isNeglected = (dateStr: string | null) => {
    if (!dateStr) return true;
    const days = (new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 3600 * 24);
    return days > 15;
  };

  useEffect(() => {
    fetchTerritories();
    fetchLeaders();
    // Initial load handled by debounce effect below or separate init?
    // Let's call it here for init if needed, but debounce effect will trigger too.
    // fetchContactsData(); // Double call if we have effect dependency.
  }, [fetchTerritories, fetchLeaders]);

  useEffect(() => {
    const timer = setTimeout(() => { 
        fetchContactsData(); 
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchContactsData]);

  // Reset page on filter change
  useEffect(() => {
      setCurrentPage(1);
  }, [query, selectedTerritory, selectedLeader, votedStatus]);

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-brand-black tracking-tight">Directorio Nacional</h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-widest mt-1">Administración de Base de Datos Electoral</p>
        </div>
        
        <div className="flex flex-col md:flex-row gap-4 w-full md:w-auto">
            {/* Filters */}
            <select 
                className="bg-white border-2 border-brand-gray-100 rounded-2xl p-4 text-xs font-bold uppercase outline-none focus:border-brand-black"
                value={selectedTerritory}
                onChange={(e) => setSelectedTerritory(e.target.value)}
            >
                <option value="">Todo Territorio</option>
                {territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>

            <select 
                className="bg-white border-2 border-brand-gray-100 rounded-2xl p-4 text-xs font-bold uppercase outline-none focus:border-brand-black"
                value={selectedLeader}
                onChange={(e) => setSelectedLeader(e.target.value)}
            >
                <option value="">Todo Líder</option>
                {leaders.map(l => <option key={l.id} value={l.id}>{l.fullName}</option>)}
            </select>
            
            <select 
                className="bg-white border-2 border-brand-gray-100 rounded-2xl p-4 text-xs font-bold uppercase outline-none focus:border-brand-black"
                value={votedStatus}
                onChange={(e) => setVotedStatus(e.target.value)}
            >
                <option value="">Estado Voto</option>
                <option value="true">YA VOTÓ</option>
                <option value="false">PENDIENTE</option>
            </select>

            <div className="relative w-full md:w-[300px] group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none transition-colors group-focus-within:text-brand-green-600">
                <Search className="h-5 w-5 text-brand-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-12 pr-4 py-4 bg-white border-2 border-brand-gray-100 rounded-2xl focus:ring-4 focus:ring-brand-green-50 focus:border-brand-black transition-all outline-none font-bold text-brand-black placeholder:text-brand-gray-300"
                placeholder="Buscar..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
        </div>
      </div>

      <div className="card-friendly overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-brand-gray-100">
            <thead className="bg-brand-gray-50">
              <tr>
                <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em]">Simpatizante</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em]">Acción</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em]">Líder Asignado</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em]">Territorio</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em]">Estado</th>
                <th className="px-6 py-5 text-left text-[10px] font-black text-brand-gray-500 uppercase tracking-[0.2em]">Fecha Alta</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-brand-gray-50">
              {loading ? (
                [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                        <td className="px-6 py-6" colSpan={6}><div className="h-4 bg-brand-gray-100 rounded-full w-full"></div></td>
                    </tr>
                ))
              ) : contacts.length > 0 ? (
                contacts.map((person) => (
                  <tr key={person.id} className="hover:bg-brand-green-50/30 transition-colors cursor-pointer group">
                    <td className="px-6 py-5 whitespace-nowrap" onClick={() => window.location.href = `/dashboard/directory/${person.id}`}>
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-12 w-12 bg-brand-black rounded-2xl flex items-center justify-center text-white font-black text-lg relative shadow-lg group-hover:bg-brand-green-600 transition-colors">
                            {person.fullName.charAt(0)}
                            {isNeglected(person.lastContacted) && (
                                <span className="absolute -top-1 -right-1 bg-red-500 rounded-full p-1 border-2 border-white animate-pulse" />
                            )}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-black text-brand-black">{person.fullName}</div>
                          <div className="text-[11px] text-brand-gray-400 font-bold flex items-center gap-1 mt-0.5">
                             <Phone className="w-3 h-3" /> {person.phone}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <a 
                        href={getWhatsAppLink(person.phone, person.fullName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-green-100 text-brand-green-700 rounded-xl hover:bg-brand-green-200 transition-all font-black text-xs uppercase tracking-tighter"
                      >
                        <MessageCircle className="w-4 h-4 fill-brand-green-700 text-brand-green-100" />
                        Chat WA
                      </a>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-brand-gray-100 rounded-lg flex items-center justify-center text-[10px] font-black text-brand-gray-500">{person.leader?.charAt(0) || 'S'}</div>
                            <span className="text-xs font-bold text-brand-gray-600">{person.leader || 'Sin Líder'}</span>
                        </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-[10px] font-black uppercase border border-blue-100 shadow-sm">
                                {person.territoryName || 'Sin Zona'}
                            </span>
                        </div>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap">
                      <span className="px-3 py-1 text-[10px] font-black rounded-full bg-brand-green-100 text-brand-green-700 uppercase tracking-widest border border-brand-green-200">
                        {person.status}
                      </span>
                    </td>
                    <td className="px-6 py-5 whitespace-nowrap text-[11px] font-bold text-brand-gray-400">
                        {new Date(person.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                    <td colSpan={6} className="px-6 py-20 text-center text-brand-gray-300 font-bold italic">
                        No se han encontrado registros en esta búsqueda.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between p-4 border-t border-brand-gray-100 bg-brand-gray-50">
            <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-2 rounded-lg hover:bg-white disabled:opacity-30 transition-all text-brand-gray-600 shadow-sm disabled:shadow-none"
            >
                <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-gray-400">
                Página {currentPage} de {totalPages} • Total: {totalCount}
            </span>
            <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-2 rounded-lg hover:bg-white disabled:opacity-30 transition-all text-brand-gray-600 shadow-sm disabled:shadow-none"
            >
                <ChevronRight className="w-5 h-5" />
            </button>
        </div>
      </div>
    </div>
  );
}
