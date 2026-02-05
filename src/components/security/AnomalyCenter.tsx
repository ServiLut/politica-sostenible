'use client';

import React, { useState, useEffect } from 'react';
import { resolveAnomaly, executeQuickAction } from '@/app/actions/anomaly';

// Tipos simulados alineados con Prisma
interface AnomalyAlert {
  id: string;
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  createdAt: Date;
  status: string;
}

export default function AnomalyCenter({ initialAlerts, actorId }: { initialAlerts: AnomalyAlert[], actorId: string }) {
  const [alerts, setAlerts] = useState<AnomalyAlert[]>(initialAlerts);
  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlert | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Polling simulation for Real-Time updates (SSE would be better in prod)
  useEffect(() => {
    const interval = setInterval(() => {
      // In real app: fetch('/api/anomalies/active').then(...)
      console.log('Polling for new anomalies...');
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleResolve = async () => {
    if (!selectedAlert) return;
    setIsProcessing(true);
    try {
      await resolveAnomaly(selectedAlert.id, resolutionNote, actorId);
      setAlerts(prev => prev.filter(a => a.id !== selectedAlert.id)); // Optimistic update
      setSelectedAlert(null);
      setResolutionNote('');
    } catch (e) {
      alert('Error resolving alert');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAction = async (alertId: string, action: 'BLOCK_USER' | 'REQUIRE_PIN' | 'CREATE_TASK') => {
    if (!confirm('¿Estás seguro de ejecutar esta acción drástica?')) return;
    await executeQuickAction(alertId, action, actorId);
    alert('Acción ejecutada correctamente');
  };

  return (
    <div className="bg-slate-50 min-h-screen p-6">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Centro de Anomalías</h1>
          <p className="text-slate-500">Monitoreo de Integridad en Tiempo Real</p>
        </div>
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded-full font-bold animate-pulse">
          {alerts.length} Alertas Activas
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {alerts.map(alert => (
          <div 
            key={alert.id} 
            className={`border-l-8 rounded-lg shadow-md bg-white p-4 relative ${
              alert.severity === 'CRITICAL' || alert.severity === 'HIGH' 
                ? 'border-red-500 shadow-red-100' 
                : 'border-yellow-400 shadow-yellow-100'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {new Date(alert.createdAt).toLocaleTimeString()}
              </span>
              <span className={`text-xs px-2 py-1 rounded font-bold ${
                 alert.severity === 'CRITICAL' ? 'bg-red-600 text-white' : 'bg-yellow-200 text-yellow-800'
              }`}>
                {alert.severity}
              </span>
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-1">{alert.type}</h3>
            <p className="text-sm text-slate-600 mb-4">{alert.description}</p>

            {/* Quick Actions Bar */}
            <div className="flex gap-2 mb-4 border-t pt-2">
              <button 
                onClick={() => handleQuickAction(alert.id, 'BLOCK_USER')}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition"
              >
                🚫 Bloquear User
              </button>
              <button 
                 onClick={() => handleQuickAction(alert.id, 'REQUIRE_PIN')}
                 className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition"
              >
                🔐 Forzar PIN
              </button>
            </div>

            <button
              onClick={() => setSelectedAlert(alert)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition"
            >
              Resolver / Cerrar
            </button>
          </div>
        ))}
        
        {alerts.length === 0 && (
          <div className="col-span-full text-center py-20 text-slate-400">
            <p className="text-xl">✅ Sistema Nominal. Sin anomalías detectadas.</p>
          </div>
        )}
      </div>

      {/* Resolution Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-6 bg-slate-50 border-b">
              <h3 className="text-xl font-bold text-slate-900">Resolviendo Caso #{selectedAlert.id.slice(0, 8)}</h3>
              <p className="text-sm text-red-600 mt-1">Esta acción es irreversible y será auditada.</p>
            </div>
            
            <div className="p-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Nota de Resolución (Obligatoria)
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Explique la causa (falso positivo, error operativo, sabotaje...) y la acción tomada."
                className="w-full h-32 border-2 border-slate-300 rounded-lg p-3 focus:border-blue-500 focus:ring-0"
              />
            </div>

            <div className="p-6 bg-slate-50 flex justify-end gap-3">
              <button
                onClick={() => setSelectedAlert(null)}
                className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleResolve}
                disabled={isProcessing || resolutionNote.length < 10}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:text-slate-500 text-white font-bold rounded-lg shadow-lg"
              >
                {isProcessing ? 'Procesando...' : 'Confirmar Resolución'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
