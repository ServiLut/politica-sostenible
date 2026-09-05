"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { createVoter } from "@/lib/voters-api";

const EMPTY_FORM = {
  documentId: "",
  firstName: "",
  lastName: "",
  phone: "",
};

export default function CapturaTerritorialPage() {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setNotice(null);

    setSaving(true);
    try {
      await createVoter({
        documentId: form.documentId.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        consentAccepted: true,
        termsVersion: "2026-v1",
        collectionChannel: "IN_PERSON",
        ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      });
      
      setForm(EMPTY_FORM);
      setConsentAccepted(false);
      setNotice("¡Guardado correctamente! Listo para el siguiente.");
      
      // Auto-hide notice after a short time to keep UI clean
      setTimeout(() => setNotice(null), 3000);
      
    } catch (error: any) {
      setFormError(error?.message || "Error al guardar el votante.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="rounded-3xl bg-slate-950 px-6 py-8 text-white shadow-xl text-center">
        <h1 className="text-4xl sm:text-5xl font-black tracking-tight">
          Modo Batalla
        </h1>
        <p className="mt-4 text-xl font-medium text-slate-300">
          Captura rápida en calle
        </p>
      </header>

      {notice && (
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-emerald-100 p-6 text-2xl font-bold text-emerald-900 shadow-sm transition-all">
          <CheckCircle2 className="text-emerald-600" size={32} />
          {notice}
        </div>
      )}

      {formError && (
        <div className="flex items-center justify-center gap-3 rounded-2xl bg-red-100 p-6 text-xl font-bold text-red-900 shadow-sm">
          <AlertCircle className="text-red-600" size={28} />
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-10 shadow-sm">
        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-2xl font-black uppercase tracking-tight text-slate-700">Documento</span>
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{5,15}"
              maxLength={15}
              autoComplete="off"
              autoFocus
              value={form.documentId}
              onChange={(e) => setForm({ ...form, documentId: e.target.value })}
              className="h-20 w-full rounded-2xl border-4 border-slate-200 px-6 font-mono text-4xl font-black text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </label>
          
          <label className="block">
            <span className="mb-2 block text-2xl font-black uppercase tracking-tight text-slate-700">Nombres</span>
            <input
              required
              maxLength={100}
              autoComplete="off"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              className="h-20 w-full rounded-2xl border-4 border-slate-200 px-6 text-4xl font-black text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </label>
          
          <label className="block">
            <span className="mb-2 block text-2xl font-black uppercase tracking-tight text-slate-700">Apellidos</span>
            <input
              required
              maxLength={100}
              autoComplete="off"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              className="h-20 w-full rounded-2xl border-4 border-slate-200 px-6 text-4xl font-black text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </label>
          
          <label className="block">
            <span className="mb-2 block text-2xl font-black uppercase tracking-tight text-slate-700">Celular (Opcional)</span>
            <input
              inputMode="tel"
              maxLength={24}
              autoComplete="off"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="h-20 w-full rounded-2xl border-4 border-slate-200 px-6 text-4xl font-black text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </label>
        </div>

        <label className="mt-6 flex items-start gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200 cursor-pointer">
          <input
            type="checkbox"
            checked={consentAccepted}
            onChange={(e) => setConsentAccepted(e.target.checked)}
            className="mt-1 h-6 w-6 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
          />
          <span className="text-sm font-medium text-slate-700 leading-relaxed">
            Confirmo que la persona autoriza verbalmente el tratamiento de sus datos personales conforme al aviso de privacidad vigente de la organización.
          </span>
        </label>

        <button
          type="submit"
          disabled={saving || !consentAccepted}
          className="mt-8 flex h-28 w-full items-center justify-center gap-4 rounded-3xl bg-blue-700 text-4xl font-black uppercase tracking-wider text-white shadow-xl transition-transform hover:scale-[1.02] hover:bg-blue-800 disabled:scale-100 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="animate-spin" size={48} />
          ) : (
            "Guardar Votante"
          )}
        </button>
      </form>
    </div>
  );
}
