"use client";

import { useState, type FormEvent } from "react";
import { AlertTriangle, Loader2, MapPin, ShieldAlert } from "lucide-react";
import { useOfflineVault } from "@/context/offline-vault";
import type {
  OfflineIncidentCategory,
  OfflineIncidentInput,
  OfflineIncidentPriority,
} from "@/lib/offline-incidents-api";

const CATEGORY_LABELS: Record<OfflineIncidentCategory, string> = {
  SECURITY: "Seguridad",
  LOGISTICS: "Logística",
  ELECTORAL_MATERIAL: "Material electoral",
  ACCESSIBILITY: "Accesibilidad",
  PUBLIC_ORDER: "Orden público",
  TECHNOLOGY: "Tecnología",
  COMPLIANCE: "Cumplimiento",
  OTHER: "Otro",
};

const PRIORITY_LABELS: Record<OfflineIncidentPriority, string> = {
  LOW: "Baja",
  MEDIUM: "Media",
  HIGH: "Alta",
  URGENT: "Urgente",
};

function todayLocal(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const EMPTY_INPUT: OfflineIncidentInput = {
  category: "LOGISTICS",
  priority: "MEDIUM",
  title: "",
  description: "",
  occurredOn: "",
};

export function OfflineIncidentCaptureForm() {
  const vault = useOfflineVault();
  const context = vault.incidentContext;
  const [input, setInput] = useState<OfflineIncidentInput>({
    ...EMPTY_INPUT,
    occurredOn: todayLocal(),
  });
  const [submitting, setSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);

  async function provision() {
    setLocalMessage(null);
    try {
      await vault.provisionIncidents();
    } catch {
      // El proveedor muestra un mensaje seguro y sin contenido del incidente.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setLocalMessage(null);
    try {
      await vault.enqueueIncident(input);
      setInput({ ...EMPTY_INPUT, occurredOn: todayLocal() });
      setLocalMessage(
        "Incidente cifrado localmente. Sigue pendiente hasta validar un recibo del servidor.",
      );
    } catch {
      // El proveedor conserva el pendiente y explica el rechazo sin imprimirlo.
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="offline-incident-title"
      className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4"
    >
      <div className="flex items-start gap-3">
        <ShieldAlert
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-orange-700"
          size={18}
        />
        <div className="min-w-0 flex-1">
          <h3 id="offline-incident-title" className="text-sm font-black">
            Incidente de campaña offline
          </h3>
          <p className="mt-1 text-xs leading-5 text-slate-700">
            Guarda sólo información operativa mínima. No escribas nombres,
            documentos, teléfonos, direcciones particulares ni adjuntes
            imágenes. Guardar aquí no reporta todavía el incidente al servidor.
          </p>
        </div>
      </div>

      {!context ? (
        <div className="mt-4">
          <p className="text-xs leading-5 text-slate-700">
            Antes de salir sin conexión debes guardar, en línea, tu rol y
            alcance territorial vigentes dentro de esta bóveda.
          </p>
          <button
            type="button"
            onClick={() => void provision()}
            disabled={vault.busy || !vault.isOnline}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {vault.busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" size={15} />
            ) : (
              <MapPin aria-hidden="true" size={15} />
            )}
            Provisionar incidentes
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-600">
            <span>Etapa provisionada: {context.stage}</span>
            <span>
              Corte {new Date(context.provisionedAt).toLocaleString("es-CO")}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-[11px] font-black text-slate-700">
              Categoría
              <select
                required
                value={input.category}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    category: event.target.value as OfflineIncidentCategory,
                  }))
                }
                className="min-h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-xs font-semibold"
              >
                {context.categories.map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[11px] font-black text-slate-700">
              Prioridad
              <select
                required
                value={input.priority}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    priority: event.target.value as OfflineIncidentPriority,
                  }))
                }
                className="min-h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-xs font-semibold"
              >
                {context.priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_LABELS[priority]}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block space-y-1 text-[11px] font-black text-slate-700">
            Fecha civil del hecho
            <input
              required
              type="date"
              max={todayLocal()}
              value={input.occurredOn}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  occurredOn: event.target.value,
                }))
              }
              className="min-h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-xs font-semibold"
            />
          </label>

          {(context.requiresTerritory || context.territories.length > 0) && (
            <label className="block space-y-1 text-[11px] font-black text-slate-700">
              Territorio{" "}
              {context.requiresTerritory ? "(obligatorio)" : "(opcional)"}
              <select
                required={context.requiresTerritory}
                value={input.divisionId ?? ""}
                onChange={(event) =>
                  setInput((current) => ({
                    ...current,
                    divisionId: event.target.value || undefined,
                  }))
                }
                className="min-h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-xs font-semibold"
              >
                <option value="">Sin territorio específico</option>
                {context.territories.map((territory) => (
                  <option key={territory.id} value={territory.id}>
                    {territory.code} · {territory.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block space-y-1 text-[11px] font-black text-slate-700">
            Título operativo
            <input
              required
              minLength={3}
              maxLength={200}
              value={input.title}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Ej. Falta material en punto logístico"
              className="min-h-11 w-full rounded-xl border border-orange-200 bg-white px-3 text-xs font-semibold"
            />
          </label>
          <label className="block space-y-1 text-[11px] font-black text-slate-700">
            Descripción sin datos personales
            <textarea
              required
              minLength={10}
              maxLength={5000}
              rows={4}
              value={input.description}
              onChange={(event) =>
                setInput((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              className="w-full rounded-xl border border-orange-200 bg-white px-3 py-3 text-xs font-semibold"
            />
          </label>

          <p className="flex items-start gap-2 text-[11px] leading-5 text-orange-900">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={14}
            />
            Al reconectar se revalidan usuario, rol, organización, etapa y
            territorio. Un rechazo conserva este pendiente para revisión.
          </p>
          {localMessage && (
            <p role="status" className="text-xs font-semibold text-emerald-800">
              {localMessage}
            </p>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="submit"
              disabled={submitting || vault.busy}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 text-xs font-black text-white disabled:opacity-50"
            >
              {submitting && (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin"
                  size={15}
                />
              )}
              Guardar cifrado y pendiente
            </button>
            <button
              type="button"
              onClick={() => void provision()}
              disabled={vault.busy || !vault.isOnline}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-orange-300 px-4 text-xs font-black text-orange-900 disabled:opacity-50"
            >
              Actualizar alcance
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
