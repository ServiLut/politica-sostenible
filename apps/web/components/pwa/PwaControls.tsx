"use client";

import {
  Download,
  LockKeyhole,
  RefreshCw,
  Share2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { OFFLINE_VAULT_OPEN_EVENT } from "@/lib/offline-vault";

interface PwaControlsProps {
  canInstall: boolean;
  installGuideAvailable: boolean;
  installed: boolean;
  isOnline: boolean;
  updateAvailable: boolean;
  applyingUpdate: boolean;
  registrationError: string | null;
  onInstall: () => void;
  onApplyUpdate: () => void;
}

export function PwaControls({
  canInstall,
  installGuideAvailable,
  installed,
  isOnline,
  updateAvailable,
  applyingUpdate,
  registrationError,
  onInstall,
  onApplyUpdate,
}: PwaControlsProps) {
  return (
    <aside
      aria-label="Estado de la aplicación"
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm"
    >
      <div
        aria-live="polite"
        aria-atomic="true"
        aria-label="Estado de conectividad"
        data-testid="pwa-connectivity-status"
        className={`inline-flex items-center gap-1.5 text-xs font-medium ${isOnline ? "text-emerald-800" : "text-amber-900"}`}
      >
        {isOnline ? (
          <Wifi aria-hidden="true" size={14} />
        ) : (
          <WifiOff aria-hidden="true" size={14} />
        )}
        {isOnline ? "En línea" : "Sin conexión"}
      </div>
      <button
        type="button"
        onClick={() =>
          window.dispatchEvent(new Event(OFFLINE_VAULT_OPEN_EVENT))
        }
        aria-haspopup="dialog"
        aria-controls="offline-vault-dialog"
        aria-label="Bóveda offline"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <LockKeyhole aria-hidden="true" size={16} /> Bóveda
        <span className="hidden sm:inline"> offline</span>
      </button>
      {registrationError && (
        <p
          role="alert"
          className="basis-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {registrationError}
        </p>
      )}

      {updateAvailable && (
        <button
          type="button"
          onClick={onApplyUpdate}
          disabled={applyingUpdate}
          aria-label={
            applyingUpdate ? "Aplicando actualización" : "Actualizar aplicación"
          }
          title={
            applyingUpdate ? "Aplicando actualización" : "Actualizar aplicación"
          }
          aria-busy={applyingUpdate}
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-3 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          <RefreshCw
            aria-hidden="true"
            className={applyingUpdate ? "animate-spin" : undefined}
            size={15}
          />
          <span className="hidden sm:inline">
            {applyingUpdate
              ? "Aplicando actualización"
              : "Actualizar aplicación"}
          </span>
        </button>
      )}

      {!installed && canInstall && (
        <button
          type="button"
          onClick={onInstall}
          aria-label="Instalar aplicación"
          title="Instalar aplicación"
          className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
        >
          <Download aria-hidden="true" size={15} />
          <span className="hidden sm:inline">Instalar aplicación</span>
        </button>
      )}

      {!installed && installGuideAvailable && !canInstall && (
        <details className="max-w-sm rounded-xl border border-slate-200 bg-white text-slate-800">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl px-3 text-sm font-medium marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            <Share2 aria-hidden="true" size={15} />
            Cómo instalar en iPhone o iPad
          </summary>
          <p className="border-t border-slate-100 px-4 py-3 text-xs leading-5 text-slate-600">
            Abre el menú Compartir del navegador y elige
            <strong> Agregar a pantalla de inicio</strong>. La aplicación se
            abrirá después en una ventana independiente.
          </p>
        </details>
      )}
    </aside>
  );
}
