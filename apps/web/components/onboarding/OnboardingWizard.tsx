"use client";

import React, { useState } from 'react';
import { apiRequest } from '@/lib/api-client';
import { Loader2, CheckCircle2, ChevronRight, SkipForward } from 'lucide-react';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 state
  const [noticeContent, setNoticeContent] = useState('Esta organización recolecta datos de contacto con fines de gestión política legítima, con consentimiento previo del titular, conforme a la Ley 1581 de 2012.');
  const [controllerName, setControllerName] = useState('');
  const [contactEmail, setContactEmail] = useState('');

  // Step 2 state
  const [inviteName, setInviteName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('ZONE_COORDINATOR');

  // Step 3 state
  const [contactName, setContactName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [contactId, setContactId] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Step 4 state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState('MEDIUM');

  const handleNext = () => {
    setStep(s => s + 1);
    setError(null);
  };

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/consent-notices/current', {
        method: 'PUT',
        body: JSON.stringify({
          version: '2026-v1',
          title: 'Aviso de privacidad',
          content: noticeContent,
          controllerName: controllerName.trim() || 'Organización política',
          contactEmail: contactEmail.trim(),
        })
      });
      handleNext();
    } catch (err: any) {
      setError(err.message || 'Error al publicar aviso');
    } finally {
      setLoading(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/team/invitations', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole
        })
      });
      handleNext();
    } catch (err: any) {
      setError(err.message || 'Error al invitar coordinador');
    } finally {
      setLoading(false);
    }
  };

  const handleStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/voters', {
        method: 'POST',
        body: JSON.stringify({
          firstName: contactName,
          lastName: contactLastName,
          documentId: contactId,
          phone: contactPhone || undefined,
          consentAccepted: true,
          termsVersion: '2026-v1',
          collectionChannel: 'IN_PERSON'
        })
      });
      handleNext();
    } catch (err: any) {
      setError(err.message || 'Error al registrar contacto');
    } finally {
      setLoading(false);
    }
  };

  const handleStep4 = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await apiRequest('/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: taskTitle,
          priority: taskPriority
        })
      });
      handleNext();
    } catch (err: any) {
      setError(err.message || 'Error al crear tarea');
    } finally {
      setLoading(false);
    }
  };

  const skipCurrentStep = () => {
    handleNext();
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <form onSubmit={handleStep1} className="flex flex-col gap-4">
            <h2 className="text-2xl font-black text-slate-800">Configura tu aviso de privacidad</h2>
            <p className="text-slate-600">Para cumplir con la ley, necesitas un aviso de privacidad activo.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Responsable del tratamiento</label>
                <input
                  type="text"
                  value={controllerName}
                  onChange={(e) => setControllerName(e.target.value)}
                  placeholder="Nombre de tu organización"
                  className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Correo para derechos de datos</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="datos@tuorganizacion.co"
                  className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                  required
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">Contenido del aviso</label>
              <textarea
                value={noticeContent}
                onChange={(e) => setNoticeContent(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                rows={4}
                required
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Publicar aviso'}
            </button>
          </form>
        );
      case 2:
        return (
          <form onSubmit={handleStep2} className="flex flex-col gap-4">
            <h2 className="text-2xl font-black text-slate-800">Invita a tu primer coordinador</h2>
            <p className="text-slate-600">Forma tu equipo para comenzar la campaña.</p>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">Correo electrónico</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">Rol</label>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
              >
                <option value="ZONE_COORDINATOR">Coordinador de zona</option>
                <option value="CAMPAIGN_MANAGER">Director de campaña</option>
                <option value="AUDITOR">Auditor</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Enviar invitación'}
              </button>
              <button
                type="button"
                onClick={skipCurrentStep}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Omitir este paso
              </button>
            </div>
          </form>
        );
      case 3:
        return (
          <form onSubmit={handleStep3} className="flex flex-col gap-4">
            <h2 className="text-2xl font-black text-slate-800">Registra tu primer contacto</h2>
            <p className="text-slate-600">Añade un simpatizante a la base de datos.</p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Nombre</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Apellido</label>
                <input
                  type="text"
                  value={contactLastName}
                  onChange={(e) => setContactLastName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Cédula</label>
                <input
                  type="text"
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-slate-700">Teléfono (opcional)</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-blue-50 p-4">
              <input type="checkbox" checked readOnly className="h-5 w-5 rounded border-blue-300 text-blue-700 focus:ring-blue-700" />
              <span className="text-sm text-blue-900">El titular autorizó el tratamiento de sus datos</span>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Registrar contacto'}
              </button>
              <button
                type="button"
                onClick={skipCurrentStep}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Omitir
              </button>
            </div>
          </form>
        );
      case 4:
        return (
          <form onSubmit={handleStep4} className="flex flex-col gap-4">
            <h2 className="text-2xl font-black text-slate-800">Programa tu primera acción</h2>
            <p className="text-slate-600">Crea una tarea para organizar tu equipo.</p>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">Título de la tarea</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-slate-700">Prioridad</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value)}
                className="w-full rounded-xl border border-slate-200 p-3 text-slate-700 focus:border-blue-700 focus:ring-blue-700"
              >
                <option value="HIGH">Alta</option>
                <option value="MEDIUM">Media</option>
                <option value="LOW">Baja</option>
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="submit"
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Crear tarea'}
              </button>
              <button
                type="button"
                onClick={skipCurrentStep}
                disabled={loading}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Omitir
              </button>
            </div>
          </form>
        );
      case 5:
        return (
          <div className="flex flex-col items-center justify-center gap-6 py-8 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <div className="space-y-2">
              <h2 className="text-3xl font-black text-slate-800">¡Tu organización está lista!</h2>
              <p className="text-lg text-slate-600">Has completado la configuración inicial.</p>
            </div>
            <button
              type="button"
              onClick={onComplete}
              className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-blue-700 px-8 py-4 font-bold text-white hover:bg-blue-800"
            >
              Ir al panel de control <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl">
        {step < 5 && (
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 p-6">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-blue-700">Paso {step} de 4</span>
              <div className="flex h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                <div 
                  className="bg-blue-700 transition-all duration-300"
                  style={{ width: `${(step / 4) * 100}%` }}
                />
              </div>
            </div>
            <button 
              onClick={onComplete}
              className="flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Saltar configuración <SkipForward className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="p-8">
          {renderStepContent()}
        </div>
      </div>
    </div>
  );
}
