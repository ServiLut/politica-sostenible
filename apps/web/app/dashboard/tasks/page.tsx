"use client";

import React, { useState, useEffect } from 'react';
import { useCRM, CampaignTask } from '@/context/CRMContext';
import { Plus, X, User, Calendar, CheckCircle, Clock, Loader2, ClipboardList } from 'lucide-react';
import { cn } from '@/components/ui/utils';

export default function TasksPage() {
  const { tasks, team, addTask, completeTask } = useCRM();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTask, setNewTask] = useState<Omit<CampaignTask, 'id' | 'status' | 'progress'>>({
    title: '',
    type: 'Puerta a Puerta',
    assignedTo: '',
    deadline: '',
    description: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    { id: 'Pendiente', title: 'Pendiente', icon: <Clock size={16} className="text-red-500" /> },
    { id: 'En Progreso', title: 'En Proceso', icon: <Loader2 size={16} className="text-amber-500 animate-spin" /> },
    { id: 'Completada', title: 'Completada', icon: <CheckCircle size={16} className="text-emerald-500" /> },
  ];

  return (
    <div className="space-y-8 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter">Misiones de Campo</h1>
          <p className="text-slate-500">Gestión de tareas operativas y despliegue territorial.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 text-white px-8 py-4 rounded-2xl font-black text-sm shadow-xl hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus size={20} /> Asignar Misión
        </button>
      </div>

      <div className="flex-1 overflow-x-auto pb-6">
        <div className="flex gap-6 min-w-max h-full">
          {columns.map((col) => {
            const colTasks = tasks.filter(t => t.status === col.id);
            return (
              <div key={col.id} className="w-96 bg-slate-100/50 rounded-[3rem] p-6 flex flex-col border border-slate-200">
                <div className="flex items-center justify-between mb-6 px-4">
                  <div className="flex items-center gap-2">
                    {col.icon}
                    <h3 className="font-black text-slate-900 text-sm uppercase tracking-widest">{col.title}</h3>
                  </div>
                  <span className="bg-white px-3 py-1 rounded-full text-[10px] font-black text-slate-400 border border-slate-200">
                    {colTasks.length}
                  </span>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                  {colTasks.map((task) => (
                    <div key={task.id} className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-widest px-3 py-1 rounded-full border",
                          task.type === 'Puerta a Puerta' ? 'bg-red-50 text-red-600 border-red-100' :
                          task.type === 'Llamadas' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                          task.type === 'Logística' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          'bg-indigo-50 text-indigo-600 border-indigo-100'
                        )}>
                          {task.type}
                        </span>
                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                          <Calendar size={10} /> {task.deadline}
                        </div>
                      </div>

                      <h4 className="text-md font-black text-slate-900 mb-2 leading-tight">{task.title}</h4>
                      <p className="text-xs text-slate-500 mb-6 line-clamp-2">{task.description}</p>

                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-500">
                            {task.assignedTo.charAt(0)}
                          </div>
                          <span className="text-xs font-bold text-slate-700">{task.assignedTo}</span>
                        </div>
                        <span className="text-[10px] font-black text-slate-400">{task.progress}%</span>
                      </div>

                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-6">
                        <div 
                          className={cn(
                            "h-full transition-all duration-1000",
                            task.status === 'Completada' ? 'bg-emerald-500' : 'bg-blue-600'
                          )} 
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>

                      {task.status !== 'Completada' && (
                        <button 
                          onClick={() => completeTask(task.id)}
                          className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-colors"
                        >
                          Marcar Completada
                        </button>
                      )}
                    </div>
                  ))}
                  {colTasks.length === 0 && (
                    <div className="text-center py-20 opacity-10 flex flex-col items-center">
                      <ClipboardList size={48} className="mb-4" />
                      <p className="text-xs font-black uppercase tracking-widest">Sin Misiones</p>
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
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsModalOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tighter">Asignar Misión</h3>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Despliegue Operativo</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 bg-white p-2 rounded-full shadow-sm"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-10 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Título de la Misión</label>
                  <input required placeholder="Ej: Barrido Comuna 13" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none transition-all" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Tipo</label>
                  <select className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none" value={newTask.type} onChange={e => setNewTask({...newTask, type: e.target.value as any})}>
                    <option value="Puerta a Puerta">Puerta a Puerta</option>
                    <option value="Llamadas">Llamadas</option>
                    <option value="Logística">Logística</option>
                    <option value="Pegar Publicidad">Pegar Publicidad</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Responsable</label>
                  <select required className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none" value={newTask.assignedTo} onChange={e => setNewTask({...newTask, assignedTo: e.target.value})}>
                    <option value="">Seleccionar...</option>
                    {team.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Fecha Límite</label>
                  <input required type="date" className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-bold focus:border-blue-500 outline-none" value={newTask.deadline} onChange={e => setNewTask({...newTask, deadline: e.target.value})} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Descripción</label>
                  <textarea required rows={3} placeholder="Instrucciones específicas para el responsable..." className="w-full px-5 py-3 border-2 border-slate-100 rounded-2xl text-sm font-medium focus:border-blue-500 outline-none" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
                </div>
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-4 bg-blue-600 rounded-2xl text-xs font-black uppercase text-white shadow-xl hover:bg-blue-700 transition-all flex items-center justify-center gap-2">
                  Asignar Misión
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
