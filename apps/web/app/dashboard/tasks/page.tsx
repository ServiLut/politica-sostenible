"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useCRM, CampaignTask } from '@/context/CRMContext';
import { Plus, X, Calendar, CheckCircle, Clock, Loader2, ClipboardList, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/components/ui/utils';
import { Input } from '@/components/ui/input';

export default function TasksPage() {
  const { tasks, team, addTask, completeTask } = useCRM();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState('Pendiente');
  
  // Refs for closing dropdowns on outside click
  const typeRef = useRef<HTMLDivElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  
  // Custom Dropdown States
  const [isTypeOpen, setIsTypeOpen] = useState(false);
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date());
  
  const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();
  
  const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  const renderCalendar = () => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const days = [];
    const totalDays = daysInMonth(year, month);
    const startDay = firstDayOfMonth(year, month);

    // Empty days at start
    for (let i = 0; i < startDay; i++) {
      days.push(<div key={`empty-${i}`} className="h-8 w-8" />);
    }

    // Days of month
    for (let i = 1; i <= totalDays; i++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      const isSelected = newTask.deadline === dateStr;
      
      days.push(
        <button
          key={i}
          type="button"
          onClick={() => {
            setNewTask({...newTask, deadline: dateStr});
            setIsCalendarOpen(false);
          }}
          className={cn(
            "h-8 w-8 rounded-full text-[10px] font-black transition-all flex items-center justify-center",
            isSelected ? "bg-teal-600 text-white shadow-lg shadow-teal-200" : "hover:bg-teal-50 text-slate-600"
          )}
        >
          {i}
        </button>
      );
    }
    return days;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeRef.current && !typeRef.current.contains(event.target as Node)) setIsTypeOpen(false);
      if (assigneeRef.current && !assigneeRef.current.contains(event.target as Node)) setIsAssigneeOpen(false);
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) setIsCalendarOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [newTask, setNewTask] = useState<Omit<CampaignTask, 'id' | 'status' | 'progress'>>({
    title: '',
    type: 'Puerta a Puerta',
    assignedTo: '',
    deadline: '',
    description: ''
  });

  const taskTypes = ['Puerta a Puerta', 'Llamadas', 'Logística', 'Pegar Publicidad'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.assignedTo || !newTask.deadline) return;
    addTask(newTask);
    setIsModalOpen(false);
    setNewTask({ title: '', type: 'Puerta a Puerta', assignedTo: '', deadline: '', description: '' });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsModalOpen(false);
    };
    if (isModalOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const columns = [
    { id: 'Pendiente', title: 'Pendiente', icon: <Clock size={16} className="text-red-500" />, color: 'bg-red-50/30 border-red-100/50' },
    { id: 'En Progreso', title: 'En Proceso', icon: <Loader2 size={16} className="text-amber-500 animate-spin" />, color: 'bg-amber-50/30 border-amber-100/50' },
    { id: 'Completada', title: 'Completada', icon: <CheckCircle size={16} className="text-emerald-500" />, color: 'bg-emerald-50/30 border-emerald-100/50' },
  ];

  return (
    <div className="space-y-4 sm:space-y-8 h-full flex flex-col p-4 sm:p-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tighter">Misiones de Campo</h1>
          <p className="text-xs sm:text-sm text-slate-500">Gestión de tareas operativas y despliegue territorial.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto bg-teal-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-2xl font-black text-xs sm:text-sm shadow-xl hover:bg-teal-700 transition-all flex items-center justify-center gap-2"
        >
          <Plus size={18} /> Asignar Misión
        </button>
      </div>

      {/* Mobile Column Selector */}
      <div className="flex sm:hidden bg-slate-100/50 p-1.5 rounded-[2rem] border border-slate-200 shadow-inner">
        {columns.map(col => (
          <button
            key={col.id}
            onClick={() => setActiveColumn(col.id)}
            className={cn(
              "flex-1 py-3 rounded-[1.5rem] text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2",
              activeColumn === col.id 
                ? "bg-white text-teal-600 shadow-sm scale-[1.02]" 
                : "text-slate-400 hover:text-slate-500"
            )}
          >
            {col.icon}
            {col.title}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-x-auto sm:overflow-visible pb-6 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-4 sm:gap-6 h-full min-w-0">
          {columns.map((col) => {
            const colTasks = tasks.filter(t => t.status === col.id);
            return (
              <div 
                key={col.id} 
                className={cn(
                  "w-full sm:w-96 rounded-[2.5rem] sm:rounded-[3rem] p-4 sm:p-6 flex flex-col border transition-all duration-500",
                  col.color,
                  activeColumn === col.id ? "flex" : "hidden sm:flex"
                )}
              >
                <div className="flex items-center justify-between mb-4 sm:mb-6 px-2 sm:px-4">
                  <div className="flex items-center gap-2">
                    {col.icon}
                    <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase tracking-widest">{col.title}</h3>
                  </div>
                  <span className="bg-white px-2 sm:px-3 py-1 rounded-full text-[10px] font-black text-slate-400 border border-slate-200">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                  {colTasks.map((task) => (
                    <div key={task.id} className="bg-white p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start mb-3 sm:mb-4">
                        <span className={cn(
                          "text-[7px] sm:text-[8px] font-black uppercase tracking-widest px-2 sm:px-3 py-1 rounded-full border",
                          task.type === 'Puerta a Puerta' ? 'bg-red-50 text-red-600 border-red-100' :
                          task.type === 'Llamadas' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                          task.type === 'Logística' ? 'bg-teal-50 text-teal-600 border-teal-100' :
                          'bg-indigo-50 text-indigo-600 border-indigo-100'
                        )}>
                          {task.type}
                        </span>
                        <div className="flex items-center gap-1 text-[8px] sm:text-[9px] font-black text-teal-600 bg-teal-50/50 px-2 sm:px-3 py-1 rounded-full border border-teal-100/50">
                          <Calendar size={10} /> {task.deadline}
                        </div>
                      </div>

                      <h4 className="text-sm sm:text-md font-black text-slate-900 mb-1 sm:mb-2 leading-tight">{task.title}</h4>
                      <p className="text-[10px] sm:text-xs text-slate-500 mb-4 sm:mb-6 line-clamp-2">{task.description}</p>

                      <div className="flex items-center justify-between mb-4 sm:mb-6">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-100 flex items-center justify-center text-[8px] sm:text-[10px] font-black text-slate-500">
                            {task.assignedTo.charAt(0)}
                          </div>
                          <span className="text-[10px] sm:text-xs font-bold text-slate-700">{task.assignedTo}</span>
                        </div>
                        <span className="text-[8px] sm:text-[10px] font-black text-slate-400">{task.progress}%</span>
                      </div>

                      <div className="h-1 sm:h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-4 sm:mb-6">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            task.status === 'Completada' ? 'bg-emerald-500' : 'bg-teal-600'
                          )} 
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>

                      {task.status !== 'Completada' && (
                        <button 
                          onClick={() => completeTask(task.id)}
                          className="w-full py-2 sm:py-3 bg-slate-900 text-white rounded-xl font-black text-[8px] sm:text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-colors"
                        >
                          Marcar Completada
                        </button>
                      )}
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center py-10 sm:py-20 opacity-10 flex flex-col items-center">
                      <ClipboardList size={32} className="sm:size-12 mb-2 sm:mb-4" />
                      <p className="text-[8px] sm:text-xs font-black uppercase tracking-widest">Sin Misiones</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Nueva Misión */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-2 sm:p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-[2.5rem] sm:rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 sm:px-8 py-6 sm:py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tighter">Asignar Misión</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Despliegue Operativo</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm transition-colors"><X size={20}/></button>
            </div>
            
            <div className="max-h-[80vh] overflow-y-auto custom-scrollbar pt-2 pb-10">
              <form onSubmit={handleSubmit} className="p-6 sm:p-10 pt-4 space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pb-20">
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Título de la Misión</label>
                    <Input 
                      required 
                      placeholder="Ej: Barrido Comuna 13" 
                      className="rounded-xl sm:rounded-[1.5rem] bg-teal-50/30 border-slate-200 font-bold focus-visible:border-teal-500 focus-visible:ring-teal-500/10 text-xs sm:text-sm" 
                      value={newTask.title} 
                      onChange={e => setNewTask({...newTask, title: e.target.value})} 
                    />
                  </div>
                  <div>
                    <label className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Tipo</label>
                    <div className="relative" ref={typeRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsTypeOpen(!isTypeOpen);
                          setIsAssigneeOpen(false);
                          setIsCalendarOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3 border-2 border-slate-200 bg-teal-50/30 rounded-xl sm:rounded-[1.5rem] text-xs sm:text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        {newTask.type}
                        <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isTypeOpen && "rotate-180")} />
                      </button>
                      {isTypeOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl sm:rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          {taskTypes.map(type => (
                            <div 
                              key={type}
                              onClick={() => {
                                setNewTask({...newTask, type: type as any});
                                setIsTypeOpen(false);
                              }}
                              className={cn(
                                "px-4 sm:px-5 py-2 sm:py-3 hover:bg-teal-50 text-[9px] sm:text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                newTask.type === type ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                              )}
                            >
                              {type}
                              {newTask.type === type && <Check size={12} className="text-teal-600" />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Responsable</label>
                    <div className="relative" ref={assigneeRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAssigneeOpen(!isAssigneeOpen);
                          setIsTypeOpen(false);
                          setIsCalendarOpen(false);
                        }}
                        className="w-full flex items-center justify-between px-4 sm:px-5 py-2.5 sm:py-3 border-2 border-slate-200 bg-teal-50/30 rounded-xl sm:rounded-[1.5rem] text-xs sm:text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        <span className="truncate">{newTask.assignedTo || "Seleccionar..."}</span>
                        <ChevronDown size={14} className={cn("text-slate-400 transition-transform", isAssigneeOpen && "rotate-180")} />
                      </button>
                      {isAssigneeOpen && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-100 rounded-xl sm:rounded-[1.5rem] shadow-2xl z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                          <div className="max-h-40 overflow-y-auto custom-scrollbar">
                            {team.map(m => (
                              <div 
                                key={m.id}
                                onClick={() => {
                                  setNewTask({...newTask, assignedTo: m.name});
                                  setIsAssigneeOpen(false);
                                }}
                                className={cn(
                                  "px-4 sm:px-5 py-2 sm:py-3 hover:bg-teal-50 text-[9px] sm:text-[10px] font-black uppercase tracking-widest cursor-pointer transition-colors border-b border-slate-50 last:border-none flex justify-between items-center",
                                  newTask.assignedTo === m.name ? "text-teal-600 bg-teal-50/30" : "text-slate-600"
                                )}
                              >
                                {m.name}
                                {newTask.assignedTo === m.name && <Check size={12} className="text-teal-600" />}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Fecha Límite</label>
                    <div className="relative" ref={calendarRef}>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCalendarOpen(!isCalendarOpen);
                          setIsTypeOpen(false);
                          setIsAssigneeOpen(false);
                        }}
                        className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-2.5 sm:py-3 border-2 border-slate-200 bg-teal-50/30 rounded-xl sm:rounded-[1.5rem] text-xs sm:text-sm font-bold text-slate-700 hover:border-teal-500 transition-all outline-none"
                      >
                        <Calendar size={16} className="text-teal-600" />
                        <span className="truncate">{newTask.deadline || "Seleccionar fecha..."}</span>
                      </button>
                      {isCalendarOpen && (
                        <div className="absolute top-full left-0 right-0 sm:right-auto mt-2 p-3 sm:p-4 bg-white border border-slate-100 rounded-[1.5rem] sm:rounded-[2rem] shadow-2xl z-[100] animate-in fade-in zoom-in-95 duration-200 min-w-[260px] sm:min-w-[280px]">
                          <div className="flex items-center justify-between mb-4">
                            <button 
                              type="button" 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1)); 
                              }}
                              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-900">
                              {monthNames[viewDate.getMonth()]} {viewDate.getFullYear()}
                            </span>
                            <button 
                              type="button" 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1)); 
                              }}
                              className="p-1.5 hover:bg-slate-50 rounded-lg text-slate-400 hover:text-teal-600 transition-all"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-7 gap-1 mb-1">
                            {['D', 'L', 'M', 'M', 'J', 'V', 'S'].map((d, i) => (
                              <div key={`${d}-${i}`} className="h-7 w-7 flex items-center justify-center text-[8px] font-black text-slate-300 uppercase">{d}</div>
                            ))}
                          </div>
                          <div className="grid grid-cols-7 gap-1">
                            {renderCalendar()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Descripción</label>
                    <textarea 
                      required 
                      rows={3} 
                      placeholder="Instrucciones específicas para el responsable..." 
                      className="w-full px-4 sm:px-5 py-2.5 sm:py-3 border-2 border-slate-200 bg-teal-50/30 rounded-xl sm:rounded-[1.5rem] text-xs sm:text-sm font-medium focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10 outline-none transition-all placeholder:text-slate-400" 
                      value={newTask.description} 
                      onChange={e => setNewTask({...newTask, description: e.target.value})} 
                    />
                  </div>
                </div>
                <div className="pt-2 sm:pt-4 flex flex-col sm:flex-row gap-3 sm:gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="order-2 sm:order-1 flex-1 px-4 py-3 sm:py-4 border-2 border-slate-100 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                  <button type="submit" className="order-1 sm:order-2 flex-1 px-4 py-3 sm:py-4 bg-teal-600 rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black uppercase text-white shadow-xl hover:bg-teal-700 transition-all flex items-center justify-center gap-2">
                    Asignar Misión
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
