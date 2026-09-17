"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArchiveX,
  CheckCircle2,
  CloudOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { useConfirmation } from "@/context/confirmation";
import { useOfflineVault } from "@/context/offline-vault";
import { useAccessibleDialog } from "@/lib/use-accessible-dialog";
import {
  OFFLINE_VAULT_OPEN_EVENT,
  type OfflineQueueRecordState,
  type OfflineQueueSummary,
} from "@/lib/offline-vault";
import { OfflineE14CaptureForm } from "./OfflineE14CaptureForm";
import { OfflineCalendarSnapshot } from "./OfflineCalendarSnapshot";
import { OfflineHeatmapSnapshots } from "./OfflineHeatmapSnapshots";
import { OfflineIncidentCaptureForm } from "./OfflineIncidentCaptureForm";
import { OfflineVoterCaptureForm } from "./OfflineVoterCaptureForm";

const STATE_LABELS: Record<OfflineQueueRecordState, string> = {
  PENDING: "Pendiente",
  SYNCING: "Sincronizando",
  CONFLICT: "Conflicto",
  FAILED: "Fallida",
  APPLIED: "Aplicada",
};

const STATE_STYLES: Record<OfflineQueueRecordState, string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-900",
  SYNCING: "border-blue-200 bg-blue-50 text-blue-900",
  CONFLICT: "border-red-200 bg-red-50 text-red-900",
  FAILED: "border-rose-200 bg-rose-50 text-rose-900",
  APPLIED: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

function operationLabel(entry: OfflineQueueSummary) {
  if (entry.type === "VOTER_CAPTURE") return "Captura de votante";
  if (entry.type === "E14_REPORT") return "Reporte E-14";
  return "Incidente de campaña";
}

function shortPartition(partitionHash: string) {
  return `Bóveda · ${partitionHash.slice(-8)}`;
}

export function OfflineVaultPanel() {
  const { user, tenant } = useAuth();
  const confirm = useConfirmation();
  const vault = useOfflineVault();
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const canCreate = vault.phase === "EMPTY" && Boolean(user && tenant);
  const pendingCount = vault.entries.filter(
    (entry) => entry.state === "PENDING",
  ).length;

  function closePanel() {
    if (vault.busy) return;
    setPassphrase("");
    setConfirmation("");
    setOpen(false);
  }

  useAccessibleDialog({
    open,
    containerRef: dialogRef,
    initialFocusRef: closeButtonRef,
    returnFocusRef: openButtonRef,
    onClose: closePanel,
    closeOnEscape: !vault.busy,
  });

  useEffect(() => {
    const clearCredentialsWhenHidden = () => {
      if (document.visibilityState !== "hidden") return;
      setPassphrase("");
      setConfirmation("");
    };
    document.addEventListener("visibilitychange", clearCredentialsWhenHidden);
    return () =>
      document.removeEventListener(
        "visibilitychange",
        clearCredentialsWhenHidden,
      );
  }, []);

  useEffect(() => {
    const openVault = () => setOpen(true);
    window.addEventListener(OFFLINE_VAULT_OPEN_EVENT, openVault);
    return () =>
      window.removeEventListener(OFFLINE_VAULT_OPEN_EVENT, openVault);
  }, []);

  async function handleCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (canCreate) {
        if (passphrase !== confirmation) return;
        await vault.createVault(passphrase);
      } else {
        await vault.unlock(passphrase, vault.selectedPartition ?? undefined);
      }
    } catch {
      // El proveedor expone un mensaje acotado; nunca registramos la frase ni
      // el payload que causó el error.
    } finally {
      setPassphrase("");
      setConfirmation("");
    }
  }

  async function handleSynchronize() {
    try {
      await vault.synchronize();
    } catch {
      // El estado seguro y el mensaje quedan centralizados en el proveedor.
    }
  }

  async function handleRetry(id: string) {
    try {
      await vault.retry(id);
    } catch {
      // No exponemos objetos de error ni payloads en consola.
    }
  }

  async function handleRemove(entry: OfflineQueueSummary) {
    const confirmed = await confirm({
      title: "Eliminar operación local",
      description: `Se eliminará definitivamente ${operationLabel(entry).toLowerCase()} ${entry.id.slice(0, 8)} de este dispositivo. Esta acción no se puede deshacer.`,
      confirmLabel: "Eliminar definitivamente",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await vault.remove(entry.id);
    } catch {
      // El proveedor mantiene la bóveda cerrada ante cualquier inconsistencia.
    }
  }

  return (
    <aside
      aria-label="Bóveda offline"
      className="pointer-events-none fixed bottom-20 left-3 z-[90] flex max-w-[calc(100vw-1.5rem)] flex-col items-start gap-2 lg:bottom-4 lg:left-4"
    >
      {open && (
        <section
          id="offline-vault-dialog"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="offline-vault-title"
          aria-busy={vault.busy}
          tabIndex={-1}
          className="pointer-events-auto fixed inset-3 max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-[1.75rem] border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl sm:inset-y-4 sm:right-4 sm:left-auto sm:w-[36rem] sm:max-w-[calc(100vw-2rem)] sm:p-6"
        >
          <header className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">
                Custodia local cifrada
              </p>
              <h2
                id="offline-vault-title"
                className="mt-1 text-xl font-black text-slate-950"
              >
                Bóveda offline
              </h2>
            </div>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closePanel}
              disabled={vault.busy}
              aria-label="Cerrar bóveda offline"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X aria-hidden="true" size={18} />
            </button>
          </header>

          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700">
            <ShieldCheck
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-emerald-700"
              size={18}
            />
            <p>
              La frase nunca se guarda. Los datos y el contexto territorial se
              cifran registro por registro; sincronizar requiere abrir esta
              bóveda y validar otra vez la misma identidad con la API. Al
              ocultar o cambiar de aplicación, la clave sale de memoria. Tras
              validar un recibo APPLIED o DUPLICATE, la copia con datos
              personales se elimina de este dispositivo.
            </p>
          </div>

          {vault.error && (
            <p
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
            >
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={15}
              />
              {vault.error}
            </p>
          )}
          {vault.message && (
            <p
              aria-live="polite"
              className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900"
            >
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 shrink-0"
                size={15}
              />
              {vault.message}
            </p>
          )}

          {vault.phase === "CHECKING" && (
            <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-600">
              <Loader2 aria-hidden="true" className="animate-spin" size={17} />
              Verificando capacidad local…
            </p>
          )}

          {vault.phase === "UNSUPPORTED" && (
            <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
              Este navegador no dispone de IndexedDB y Web Crypto. La captura
              offline permanece deshabilitada y no se simulará almacenamiento.
            </p>
          )}

          {(vault.phase === "LOCKED" || vault.phase === "EMPTY") && (
            <form onSubmit={handleCredentials} className="mt-5 space-y-4">
              {!user && vault.knownPartitions.length > 1 && (
                <label className="block space-y-2 text-xs font-black uppercase tracking-wide text-slate-600">
                  Partición local
                  <select
                    value={vault.selectedPartition ?? ""}
                    onChange={(event) =>
                      vault.selectPartition(event.target.value)
                    }
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950"
                  >
                    {vault.knownPartitions.map((partition) => (
                      <option key={partition} value={partition}>
                        {shortPartition(partition)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {vault.phase === "EMPTY" && !canCreate ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
                  No hay una bóveda conocida. Inicia sesión con conexión para
                  crear y provisionar una antes de trabajar sin internet.
                </p>
              ) : (
                <>
                  <label className="block space-y-2 text-xs font-black uppercase tracking-wide text-slate-600">
                    Frase operativa
                    <input
                      required
                      type="password"
                      minLength={12}
                      maxLength={256}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={passphrase}
                      onChange={(event) => setPassphrase(event.target.value)}
                      className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-950"
                    />
                  </label>
                  {canCreate && (
                    <label className="block space-y-2 text-xs font-black uppercase tracking-wide text-slate-600">
                      Confirmar frase
                      <input
                        required
                        type="password"
                        minLength={12}
                        maxLength={256}
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={confirmation}
                        onChange={(event) =>
                          setConfirmation(event.target.value)
                        }
                        className="min-h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-semibold normal-case tracking-normal text-slate-950"
                      />
                      {confirmation && confirmation !== passphrase && (
                        <span className="block normal-case tracking-normal text-red-700">
                          Las frases no coinciden.
                        </span>
                      )}
                    </label>
                  )}
                  <button
                    type="submit"
                    disabled={
                      vault.busy ||
                      passphrase.length < 12 ||
                      (canCreate && passphrase !== confirmation)
                    }
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {vault.busy ? (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                        size={16}
                      />
                    ) : (
                      <KeyRound aria-hidden="true" size={16} />
                    )}
                    {canCreate ? "Crear bóveda cifrada" : "Desbloquear bóveda"}
                  </button>
                </>
              )}
            </form>
          )}

          {vault.phase === "UNLOCKED" && (
            <div className="mt-5 space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSynchronize()}
                  disabled={vault.busy || !vault.isOnline || pendingCount === 0}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {vault.busy ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={16}
                    />
                  ) : (
                    <RefreshCw aria-hidden="true" size={16} />
                  )}
                  Sincronizar pendientes ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={vault.lock}
                  disabled={vault.busy}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 text-xs font-black text-slate-700 disabled:opacity-50"
                >
                  <LockKeyhole aria-hidden="true" size={16} /> Bloquear
                </button>
              </div>

              {!vault.isOnline && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
                  <CloudOff
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                    size={15}
                  />
                  Sin conexión: puedes capturar, pero la sincronización manual
                  permanece bloqueada.
                </p>
              )}

              {vault.storagePersistence !== "GRANTED" &&
                vault.storagePersistence !== "UNKNOWN" && (
                  <p
                    role="status"
                    className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950"
                  >
                    <AlertCircle
                      aria-hidden="true"
                      className="mt-0.5 shrink-0"
                      size={15}
                    />
                    {vault.storagePersistence === "UNSUPPORTED"
                      ? "Este navegador no permite solicitar almacenamiento persistente. La bóveda sigue cifrada, pero el navegador o el sistema podrían eliminar sus copias locales para liberar espacio."
                      : "El navegador no concedió almacenamiento persistente. La bóveda sigue cifrada, pero el navegador o el sistema podrían eliminar sus copias locales para liberar espacio."}
                  </p>
                )}

              <OfflineHeatmapSnapshots
                snapshots={vault.heatmapSnapshots}
                isOnline={vault.isOnline}
              />

              <OfflineCalendarSnapshot />
              <OfflineIncidentCaptureForm />
              <OfflineVoterCaptureForm />
              <OfflineE14CaptureForm />

              <section aria-labelledby="offline-queue-title">
                <div className="flex items-center justify-between gap-3">
                  <h3 id="offline-queue-title" className="text-sm font-black">
                    Operaciones locales ({vault.entries.length})
                  </h3>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Sin payload visible
                  </span>
                </div>

                {vault.entries.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                    No hay operaciones cifradas en esta partición.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {vault.entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-black text-slate-950">
                              {operationLabel(entry)} · {entry.id.slice(0, 8)}
                            </p>
                            <p className="mt-1 text-[11px] text-slate-500">
                              Capturada{" "}
                              {new Date(entry.capturedAt).toLocaleString(
                                "es-CO",
                              )}
                              {entry.type === "E14_REPORT" && (
                                <>
                                  {" · "}
                                  {entry.captureContext === "SIMULATION"
                                    ? "SIMULACRO"
                                    : "REAL"}
                                  {" · "}
                                  {Math.ceil(
                                    (entry.evidenceBytes ?? 0) / 1_024,
                                  )}
                                  {" KiB cifrados"}
                                </>
                              )}
                              {entry.attempts > 0
                                ? ` · ${entry.attempts} intento(s)`
                                : ""}
                            </p>
                          </div>
                          <span
                            className={`rounded-full border px-2 py-1 text-[10px] font-black ${STATE_STYLES[entry.state]}`}
                          >
                            {STATE_LABELS[entry.state]}
                          </span>
                        </div>
                        {entry.lastError && (
                          <p className="mt-3 rounded-lg bg-slate-50 p-3 text-[11px] font-semibold leading-5 text-slate-700">
                            {entry.lastError.message}
                          </p>
                        )}
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry.state === "FAILED" && (
                            <button
                              type="button"
                              onClick={() => void handleRetry(entry.id)}
                              disabled={vault.busy}
                              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-200 px-3 text-[11px] font-black text-blue-800"
                            >
                              <RotateCcw aria-hidden="true" size={13} />
                              Preparar reintento
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleRemove(entry)}
                            disabled={vault.busy || entry.state === "SYNCING"}
                            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-red-200 px-3 text-[11px] font-black text-red-800 disabled:opacity-50"
                          >
                            <ArchiveX aria-hidden="true" size={13} /> Eliminar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </section>
      )}

      <button
        ref={openButtonRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="offline-vault-dialog"
        hidden={open}
        className="pointer-events-auto inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
      >
        <LockKeyhole aria-hidden="true" size={16} />
        Bóveda offline
        {vault.phase === "UNLOCKED" ? ` · ${vault.entries.length}` : ""}
      </button>
    </aside>
  );
}
