'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { CheckSquare, Plus, Clock, MapPin, User, AlertCircle, Calendar, Flag, Check, X, Upload, FileText, AlertTriangle } from 'lucide-react';

interface Task {
    id: string;
    title: string;
    description: string;
    priority: number;
    dueDate: string | null;
    status: 'PENDING' | 'DONE' | 'OVERDUE' | 'IN_REVIEW';
    createdAt: string;
    user?: { fullName: string; territoryName?: string }; // Updated interface
    territory?: { name: string };
    evidenceText?: string;
    evidenceUrl?: string;
    adminFeedback?: string;
}

interface UserSummary {
    id: string;
    fullName: string;
    role: string;
    territories?: string;
}

import { toast } from 'sonner';
import { getTaskEvidenceUrl } from '@/app/actions/task';

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdminOrCoord, setIsAdminOrCoord] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);

  // Evidence Modal State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [reportText, setReportText] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Audit Modal State
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditFeedback, setAuditFeedback] = useState('');
  const [activeTab, setActiveTab] = useState<'operational' | 'review' | 'history'>('operational');
  const [signedEvidenceUrl, setSignedEvidenceUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  const [newTask, setNewTask] = useState({ title: '', description: '', assignedToId: '', priority: '3', dueDate: '' });

  useEffect(() => {
      if (auditModalOpen && selectedTask?.evidenceUrl) {
          setSignedEvidenceUrl(null); // Reset
          setImageError(false);
          getTaskEvidenceUrl(selectedTask.evidenceUrl).then(res => {
              if (res.data?.signedUrl) {
                  setSignedEvidenceUrl(res.data.signedUrl);
              } else {
                  setImageError(true);
              }
          }).catch(() => setImageError(true));
      }
  }, [auditModalOpen, selectedTask]);

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        try {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
                const me = await meRes.json();
                const canAssign = me.role === 'ADMIN' || me.role === 'COORDINATOR';
                setIsAdminOrCoord(canAssign);
                if (canAssign) {
                    const usersRes = await fetch('/api/users');
                    if (usersRes.ok) setUsers(await usersRes.json());
                }
            }
            const tasksRes = await fetch('/api/tasks');
            if (tasksRes.ok) setTasks(await tasksRes.json());
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };
    init();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title) return;
    try {
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newTask)
        });
        if (res.ok) {
            toast.success('Misión Asignada', { description: 'El objetivo ha sido enviado al líder.' });
            setNewTask({ title: '', description: '', assignedToId: '', priority: '3', dueDate: '' });
            const tasksRes = await fetch('/api/tasks');
            if (tasksRes.ok) setTasks(await tasksRes.json());
        } else {
            toast.error('Error al asignar misión');
        }
    } catch (e) { toast.error('Fallo de conexión'); }
  };

  const openReportModal = (task: Task) => {
    setSelectedTask(task);
    setReportText('');
    setEvidenceFile(null);
    setReportModalOpen(true);
  };

  const openAuditModal = (task: Task) => {
      setSelectedTask(task);
      setAuditFeedback('');
      setAuditModalOpen(true);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedTask || !reportText || !evidenceFile) {
          toast.error('Datos incompletos', { description: 'Debes incluir un informe y una foto.' });
          return;
      }

      setIsSubmitting(true);
      try {
          // 1. Upload Evidence
          const formData = new FormData();
          formData.append('file', evidenceFile);
          formData.append('taskId', selectedTask.id);
          
          const uploadRes = await fetch('/api/upload/evidence', {
              method: 'POST',
              body: formData
          });

          if (!uploadRes.ok) throw new Error('Error subiendo evidencia');
          const { url } = await uploadRes.json();

          // 2. Complete Task
          const res = await fetch('/api/tasks/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  taskId: selectedTask.id,
                  evidenceText: reportText,
                  evidenceUrl: url
              })
          });

          if (res.ok) {
             toast.success('Misión Enviada a Revisión', { description: 'El reporte ha sido cargado exitosamente.' });
             setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: 'IN_REVIEW', evidenceText: reportText, evidenceUrl: url } : t));
             setReportModalOpen(false);
          } else {
              toast.error('Error al reportar');
          }
      } catch (error) {
          console.error(error);
          toast.error('Error de conexión');
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleAuditSubmit = async (action: 'APPROVE' | 'REJECT') => {
      if (!selectedTask) return;
      setIsSubmitting(true);
      try {
          const res = await fetch('/api/tasks/review', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                  taskId: selectedTask.id, 
                  action,
                  feedback: auditFeedback 
              })
          });

          if (res.ok) {
              const newStatus = action === 'APPROVE' ? 'DONE' : 'PENDING';
              toast.success(`Misión ${action === 'APPROVE' ? 'Aprobada' : 'Rechazada'}`, { description: 'El estado ha sido actualizado.' });
              setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, status: newStatus } : t));
              setAuditModalOpen(false);
          } else {
              toast.error('Error al auditar');
          }
      } catch (e) {
          console.error(e);
          toast.error('Error de conexión');
      } finally {
          setIsSubmitting(false);
      }
  };

  const isOverdue = (dateStr: string | null) => {
      if (!dateStr) return false;
      const due = new Date(dateStr);
      due.setHours(23, 59, 59, 999);
      return due < new Date();
  };

  const filteredTasks = tasks.filter(t => {
      if (activeTab === 'operational') return t.status === 'PENDING' || t.status === 'OVERDUE';
      if (activeTab === 'review') return t.status === 'IN_REVIEW';
      if (activeTab === 'history') return t.status === 'DONE';
      return false;
  });

  return (
    <div className="h-[calc(100vh-6rem)] w-full max-w-[1600px] mx-auto p-4 overflow-hidden flex flex-col animate-in fade-in duration-500">
      
      <div className="mb-8">
          <h1 className="text-3xl font-black text-brand-black tracking-tight">Misiones Estratégicas</h1>
          <p className="text-brand-gray-500 font-bold uppercase text-xs tracking-widest mt-1">Gestión de despliegue y objetivos</p>
      </div>

      <div className="grid grid-cols-12 gap-8 h-full min-h-0">
        
        <div className="col-span-12 lg:col-span-4 flex flex-col h-full overflow-hidden">
            {isAdminOrCoord ? (
                <div className="card-friendly p-8 flex flex-col gap-6 overflow-y-auto">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-brand-black text-white rounded-xl shadow-lg shadow-brand-black/20">
                            <Plus className="w-5 h-5" />
                        </div>
                        <h3 className="font-black text-brand-black uppercase text-sm tracking-widest">Nueva Misión</h3>
                    </div>
                    
                    <form onSubmit={handleCreate} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Título</label>
                            <input type="text" className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none text-sm font-bold transition-all" placeholder="Ej. Activación Comuna 10" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} required />
                        </div>
                        
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Responsable</label>
                            <div className="relative">
                                <select className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none text-sm font-bold appearance-none" value={newTask.assignedToId} onChange={e => setNewTask({...newTask, assignedToId: e.target.value})} required>
                                    <option value="">-- Seleccionar --</option>
                                    {users.map(u => <option key={u.id} value={u.id}>{u.fullName} {u.territories ? `(${u.territories})` : '(Sin Zona)'}</option>)}
                                </select>
                                <User className="w-4 h-4 text-brand-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Prioridad</label>
                                <select className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none text-sm font-bold" value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})}>
                                    <option value="1">Baja</option>
                                    <option value="3">Normal</option>
                                    <option value="5">Alta</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Plazo</label>
                                <input type="date" className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none text-sm font-bold" value={newTask.dueDate} onChange={e => setNewTask({...newTask, dueDate: e.target.value})} />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1">Instrucciones</label>
                            <textarea className="w-full p-3.5 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none text-sm font-bold resize-none" placeholder="..." rows={3} value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})} />
                        </div>

                        <button type="submit" className="btn-primary-friendly w-full py-4 uppercase tracking-widest text-xs mt-2 shadow-xl shadow-brand-black/10">
                            Asignar Misión
                        </button>
                    </form>
                </div>
            ) : (
                <div className="bg-brand-gray-50 border-2 border-dashed border-brand-gray-200 rounded-3xl p-10 flex flex-col items-center justify-center text-center h-full">
                    <User className="w-12 h-12 mb-4 text-brand-gray-300" />
                    <p className="font-black text-brand-black uppercase text-xs tracking-widest">Personal de Campo</p>
                    <p className="text-[10px] text-brand-gray-400 font-bold mt-2 uppercase">Solo visualizas tus asignaciones</p>
                </div>
            )}
        </div>

        <div className="col-span-12 lg:col-span-8 flex flex-col h-full min-h-0 overflow-hidden">
            <div className="flex items-center justify-between mb-6 px-2">
                 <div className="flex bg-brand-gray-100 p-1 rounded-2xl">
                     <button onClick={() => setActiveTab('operational')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'operational' ? 'bg-white shadow-sm text-brand-black' : 'text-brand-gray-400 hover:text-brand-gray-600'}`}>Operativas</button>
                     <button onClick={() => setActiveTab('review')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'review' ? 'bg-white shadow-sm text-brand-black' : 'text-brand-gray-400 hover:text-brand-gray-600'}`}>
                         Por Revisar
                         {tasks.filter(t => t.status === 'IN_REVIEW').length > 0 && <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
                     </button>
                     <button onClick={() => setActiveTab('history')} className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white shadow-sm text-brand-black' : 'text-brand-gray-400 hover:text-brand-gray-600'}`}>Finalizadas</button>
                 </div>
                 <span className="bg-brand-gray-100 text-brand-gray-600 px-3 py-1 rounded-full text-[10px] font-black">{filteredTasks.length}</span>
            </div>

            <div className="flex-1 overflow-y-auto pr-4 space-y-4 pb-12">
                {loading ? (
                    <div className="text-center py-20 text-brand-gray-400 font-bold italic animate-pulse uppercase text-xs tracking-widest">Sincronizando base de datos...</div>
                ) : filteredTasks.length > 0 ? (
                    filteredTasks.map(task => {
                        const overdue = isOverdue(task.dueDate);
                        const isHigh = task.priority >= 5;
                        const isReview = task.status === 'IN_REVIEW';
                        const isDone = task.status === 'DONE';

                        console.log('Tarea:', task.title, 'Status:', task.status, 'Feedback:', task.adminFeedback);

                        return (
                            <div key={task.id} className={`card-friendly p-6 border-l-[6px] transition-all duration-500 group relative overflow-hidden
                                ${isDone ? 'border-l-brand-gray-300 opacity-60' : isReview ? 'border-l-yellow-500 bg-yellow-50/10' : isHigh ? 'border-l-red-500 bg-red-50/10' : 'border-l-brand-green-500'}
                                ${overdue && !isReview && !isDone ? 'bg-red-50/30' : ''}
                            `}>
                                <div className="flex justify-between items-start gap-6">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-2">
                                            {isReview && <span className="text-[9px] font-black text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full uppercase tracking-tighter flex items-center gap-1"><Clock className="w-3 h-3" /> En Revisión</span>}
                                            {isHigh && !isReview && !isDone && <span className="text-[9px] font-black text-red-600 bg-red-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">Crítica</span>}
                                            {overdue && !isReview && !isDone && <span className="text-[9px] font-black text-white bg-red-600 px-2 py-0.5 rounded-full uppercase tracking-tighter animate-pulse">Vencida</span>}
                                            {isDone && <span className="text-[9px] font-black text-brand-gray-500 bg-brand-gray-200 px-2 py-0.5 rounded-full uppercase tracking-tighter">Completada</span>}
                                            <span className="text-[9px] text-brand-gray-400 font-black uppercase tracking-widest flex items-center gap-1.5">
                                                <Calendar className="w-3 h-3" />
                                                {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Pendiente'}
                                            </span>
                                        </div>

                                        {task.status === 'PENDING' && task.adminFeedback && (
                                            <div className="mb-4 p-3 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm rounded-md shadow-sm">
                                                <p className="font-bold flex items-center gap-2">
                                                    🛑 CORRECCIÓN REQUERIDA:
                                                </p>
                                                <p className="mt-1 pl-6 italic">&quot;{task.adminFeedback}&quot;</p>
                                            </div>
                                        )}
                                        
                                        <h4 className="font-black text-brand-black text-lg tracking-tight group-hover:text-brand-green-700 transition-colors">{task.title}</h4>
                                        <p className="text-brand-gray-500 text-sm font-medium mt-1 line-clamp-2 leading-relaxed">{task.description}</p>
                                        
                                        <div className="mt-5 flex items-center gap-4">
                                            {task.user && (
                                                <div className="flex items-center gap-2 text-[10px] font-black text-brand-gray-600 bg-brand-gray-100 px-3 py-1.5 rounded-xl uppercase">
                                                    <User className="w-3 h-3" /> {task.user.fullName}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons Logic */}
                                    {activeTab === 'review' && isAdminOrCoord ? (
                                        <button onClick={() => openAuditModal(task)} className="w-14 h-14 rounded-2xl border-2 border-yellow-200 bg-yellow-50 flex items-center justify-center text-yellow-600 hover:bg-yellow-100 hover:border-yellow-400 transition-all shadow-sm hover:shadow-lg" title="Auditar Misión">
                                            <AlertCircle className="w-7 h-7" />
                                        </button>
                                    ) : isReview ? (
                                        <div className="w-14 h-14 rounded-2xl border-2 border-yellow-100 bg-yellow-50 flex items-center justify-center text-yellow-600 cursor-not-allowed opacity-80" title="Esperando aprobación">
                                            <Clock className="w-7 h-7 animate-pulse" />
                                        </div>
                                    ) : isDone ? (
                                        <div className="w-14 h-14 rounded-2xl border-2 border-brand-gray-100 flex items-center justify-center text-brand-green-500">
                                            <Check className="w-7 h-7" />
                                        </div>
                                    ) : (
                                        <button onClick={() => openReportModal(task)} className="w-14 h-14 rounded-2xl border-2 border-brand-gray-100 flex items-center justify-center text-brand-gray-200 hover:border-brand-green-500 hover:bg-brand-green-50 hover:text-brand-green-600 transition-all shadow-sm hover:shadow-lg group-active:scale-90 flex-shrink-0" title="Reportar Cumplimiento">
                                            <Check className="w-7 h-7" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-brand-gray-300 border-4 border-dashed border-brand-gray-50 rounded-[40px] p-20 bg-white">
                        <CheckSquare className="w-16 h-16 mb-4 opacity-10" />
                        <p className="font-black uppercase tracking-widest text-xs">Sin misiones en esta vista</p>
                    </div>
                )}
            </div>
        </div>

      </div>

      {/* MODAL DE REPORTE (EVIDENCIA) */}
      {reportModalOpen && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="bg-brand-gray-50 px-6 py-4 border-b border-brand-gray-100 flex justify-between items-center">
                    <div>
                        <h3 className="font-black text-brand-black uppercase text-sm tracking-widest">Reportar Cumplimiento</h3>
                        <p className="text-[10px] font-bold text-brand-gray-400 mt-1 truncate max-w-[300px]">{selectedTask.title}</p>
                    </div>
                    <button onClick={() => setReportModalOpen(false)} className="p-2 hover:bg-brand-gray-200 rounded-full transition-colors text-brand-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                <form onSubmit={handleReportSubmit} className="p-6 space-y-6">
                    {/* INFO BLOCK */}
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0" />
                        <div className="space-y-1">
                            <p className="text-xs font-black text-blue-800 uppercase tracking-wide">Protocolo de Evidencia</p>
                            <p className="text-[11px] text-blue-600 font-medium leading-relaxed">
                                Para marcar esta misión como completada, es obligatorio adjuntar una fotografía del sitio/actividad y un breve informe de ejecución.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1 flex items-center gap-2">
                            <FileText className="w-3 h-3" /> Informe de Ejecución
                        </label>
                        <textarea 
                            className="w-full p-4 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-2xl focus:border-brand-black focus:bg-white outline-none text-sm font-bold resize-none min-h-[100px]" 
                            placeholder="Describe los resultados obtenidos, incidencias o detalles relevantes..."
                            value={reportText}
                            onChange={(e) => setReportText(e.target.value)}
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] ml-1 flex items-center gap-2">
                            <Upload className="w-3 h-3" /> Evidencia Fotográfica
                        </label>
                        <div className="relative group">
                            <input 
                                type="file" 
                                accept="image/*"
                                onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                required
                            />
                            <div className={`w-full p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${evidenceFile ? 'border-brand-green-500 bg-brand-green-50' : 'border-brand-gray-200 bg-brand-gray-50 group-hover:bg-white group-hover:border-brand-gray-300'}`}>
                                {evidenceFile ? (
                                    <>
                                        <Check className="w-8 h-8 text-brand-green-600 mb-2" />
                                        <p className="text-xs font-black text-brand-green-700 uppercase tracking-wide">{evidenceFile.name}</p>
                                        <p className="text-[10px] text-brand-green-600 font-medium mt-1">Listo para subir</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center mb-3">
                                            <Upload className="w-5 h-5 text-brand-gray-400" />
                                        </div>
                                        <p className="text-xs font-black text-brand-gray-500 uppercase tracking-wide">Toca para subir foto</p>
                                        <p className="text-[10px] text-brand-gray-400 font-medium mt-1">JPG, PNG (Max 5MB)</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <button 
                            type="submit" 
                            disabled={isSubmitting}
                            className="btn-primary-friendly w-full py-4 uppercase tracking-widest text-xs shadow-xl shadow-brand-black/10 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <Clock className="w-4 h-4 animate-spin" />
                                    Enviando...
                                </>
                            ) : (
                                'Enviar a Revisión'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* MODAL DE AUDITORÍA (ADMIN) */}
      {auditModalOpen && selectedTask && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-black/60 backdrop-blur-md animate-in fade-in duration-200">
              <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                  <div className="bg-brand-black text-white px-8 py-6 flex justify-between items-start shrink-0">
                      <div>
                          <div className="flex items-center gap-2 mb-2">
                              <span className="bg-yellow-500 text-brand-black text-[10px] font-black uppercase px-2 py-0.5 rounded-full">Revisión Requerida</span>
                          </div>
                          <h3 className="font-black text-2xl tracking-tight leading-none">{selectedTask.title}</h3>
                          <p className="text-brand-gray-400 text-sm font-medium mt-2">{selectedTask.description}</p>
                      </div>
                      <button onClick={() => setAuditModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
                          <X className="w-6 h-6" />
                      </button>
                  </div>

                  <div className="p-8 overflow-y-auto">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          {/* Columna Izquierda: Informe */}
                          <div className="space-y-6">
                              <div>
                                  <h4 className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                                      <User className="w-3 h-3" /> Responsable
                                  </h4>
                                  <div className="p-4 bg-brand-gray-50 rounded-2xl border-2 border-brand-gray-100">
                                      <p className="font-bold text-brand-black">{selectedTask.user?.fullName || 'Desconocido'}</p>
                                      <p className="text-xs text-brand-gray-500 mt-1">{selectedTask.user?.territoryName || 'Sin territorio'}</p>
                                  </div>
                              </div>

                              <div>
                                  <h4 className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                                      <FileText className="w-3 h-3" /> Informe del Líder
                                  </h4>
                                  <div className="p-4 bg-brand-gray-50 rounded-2xl border-2 border-brand-gray-100 min-h-[120px]">
                                      <p className="text-sm text-brand-gray-700 italic leading-relaxed">
                                          &quot;{selectedTask.evidenceText || 'Sin informe escrito.'}&quot;
                                      </p>
                                  </div>
                              </div>
                          </div>

                          {/* Columna Derecha: Evidencia Visual */}
                          <div>
                              <h4 className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] mb-3 flex items-center gap-2">
                                  <Upload className="w-3 h-3" /> Evidencia Adjunta
                              </h4>
                              <div className="aspect-square bg-brand-gray-100 rounded-2xl border-2 border-brand-gray-200 overflow-hidden relative group">
                                  {selectedTask.evidenceUrl ? (
                                      imageError ? (
                                          <div className="flex flex-col items-center justify-center h-full text-red-400 bg-red-50">
                                              <AlertCircle className="w-8 h-8 mb-2" />
                                              <p className="text-[10px] font-bold uppercase text-center px-4">Evidencia no disponible (Error 404)</p>
                                          </div>
                                      ) : signedEvidenceUrl ? (
                                          <Image 
                                              src={signedEvidenceUrl} 
                                              alt="Evidencia" 
                                              fill 
                                              className="object-cover" 
                                              onError={() => setImageError(true)} 
                                              unoptimized
                                          />
                                      ) : (
                                          <div className="flex flex-col items-center justify-center h-full text-brand-gray-400 animate-pulse">
                                              <Upload className="w-8 h-8 mb-2 opacity-50" />
                                              <p className="text-[10px] font-bold uppercase">Cargando...</p>
                                          </div>
                                      )
                                  ) : (
                                      <div className="flex flex-col items-center justify-center h-full text-brand-gray-400">
                                          <AlertTriangle className="w-10 h-10 mb-2 opacity-20" />
                                          <p className="text-xs font-bold uppercase">Sin imagen</p>
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>

                      {/* Feedback y Acciones */}
                      <div className="mt-8 pt-8 border-t border-brand-gray-100">
                          <label className="text-[10px] font-black text-brand-gray-400 uppercase tracking-[0.15em] mb-2 block">
                              Retroalimentación (Opcional)
                          </label>
                          <input 
                              type="text" 
                              className="w-full p-3 bg-brand-gray-50 border-2 border-brand-gray-100 rounded-xl focus:border-brand-black outline-none text-sm font-bold mb-6"
                              placeholder="Escribe un comentario para el líder..."
                              value={auditFeedback}
                              onChange={(e) => setAuditFeedback(e.target.value)}
                          />

                          <div className="grid grid-cols-2 gap-4">
                              <button 
                                  onClick={() => handleAuditSubmit('REJECT')}
                                  disabled={isSubmitting}
                                  className="py-4 rounded-xl border-2 border-red-100 bg-red-50 text-red-600 font-black uppercase tracking-widest text-xs hover:bg-red-100 hover:border-red-200 transition-all disabled:opacity-50"
                              >
                                  Rechazar
                              </button>
                              <button 
                                  onClick={() => handleAuditSubmit('APPROVE')}
                                  disabled={isSubmitting}
                                  className="py-4 rounded-xl bg-brand-green-500 text-white font-black uppercase tracking-widest text-xs hover:bg-brand-green-600 shadow-lg shadow-brand-green-500/30 transition-all disabled:opacity-50"
                              >
                                  {isSubmitting ? 'Procesando...' : 'Aprobar Misión'}
                              </button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
}