"use client";

import { Download, RefreshCw, Share2, Wifi, WifiOff } from "lucide-react";

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
      className="pointer-events-none fixed right-3 bottom-20 z-50 flex max-w-[calc(100vw-1.5rem)] flex-col items-end gap-2 lg:right-4 lg:bottom-4"
    >
      {registrationError && (
        <p
          role="alert"
          className="max-w-sm rounded-xl border border-red-200 bg-white px-4 py-3 text-xs font-semibold text-red-800 shadow-xl"
        >
          {registrationError}
        </p>
      )}

      {updateAvailable && (
        <button
          type="button"
          onClick={onApplyUpdate}
          disabled={applyingUpdate}
          className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black text-white shadow-xl transition hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          <RefreshCw
            aria-hidden="true"
            className={applyingUpdate ? "animate-spin" : undefined}
            size={15}
          />
          {applyingUpdate ? "Aplicando actualización" : "Actualizar aplicación"}
        </button>
      )}

      {!installed && canInstall && (
        <button
          type="button"
          onClick={onInstall}
          className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white shadow-xl transition hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <Download aria-hidden="true" size={15} />
          Instalar aplicación
        </button>
      )}

      {!installed && installGuideAvailable && !canInstall && (
        <details className="pointer-events-auto max-w-sm rounded-xl border border-slate-200 bg-white text-slate-800 shadow-xl">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-xs font-black marker:content-none">
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

      <div
        aria-live="polite"
        aria-atomic="true"
        aria-label="Estado de conectividad"
        data-testid="pwa-connectivity-status"
        className={`inline-flex min-h-9 items-center gap-2 rounded-full border bg-white px-3 text-[11px] font-black shadow-lg ${
          isOnline
            ? "border-emerald-200 text-emerald-800"
            : "border-amber-300 text-amber-900"
        }`}
      >
        {isOnline ? (
          <Wifi aria-hidden="true" size={14} />
        ) : (
          <WifiOff aria-hidden="true" size={14} />
        )}
        {isOnline ? "En línea" : "Sin conexión"}
      </div>
    </aside>
  );
}
