"use client";

import { useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileLock2,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useConfirmation } from "@/context/confirmation";
import { useOfflineVault } from "@/context/offline-vault";
import {
  E14_FORM_LABELS,
  WITNESS_CREDENTIAL_LABELS,
  WITNESS_RECLAMATION_GROUND_LABELS,
  validateWitnessVoteBreakdown,
  type E14FormType,
  type WitnessCredentialType,
  type WitnessReclamationGround,
} from "@/lib/election-api";
import {
  OFFLINE_E14_MAX_FILE_BYTES,
  OFFLINE_E14_MAX_QUEUE_ENTRIES,
  OFFLINE_E14_MAX_TOTAL_BYTES,
} from "@/lib/offline-vault";
import type { OfflineE14ReportInput } from "@/lib/offline-e14-api";

interface E14FormState {
  puestoId: string;
  mesa: string;
  credentialType: WitnessCredentialType;
  credentialReference: string;
  checkedInAt: string;
  e14FormType: E14FormType;
  candidateVotes: string;
  blankVotes: string;
  nullVotes: string;
  unmarkedVotes: string;
  totalTableVotes: string;
  hasWrittenClaim: boolean;
  reclamationGround: WitnessReclamationGround | "";
  reclamationDescription: string;
  observations: string;
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function emptyForm(): E14FormState {
  return {
    puestoId: "",
    mesa: "",
    credentialType: "E15",
    credentialReference: "",
    checkedInAt: localDateTimeValue(),
    e14FormType: "DELEGADOS",
    candidateVotes: "0",
    blankVotes: "0",
    nullVotes: "0",
    unmarkedVotes: "0",
    totalTableVotes: "0",
    hasWrittenClaim: false,
    reclamationGround: "",
    reclamationDescription: "",
    observations: "",
  };
}

function integer(value: string) {
  return Number.parseInt(value, 10);
}

function mib(bytes: number) {
  return Math.round((bytes / 1_048_576) * 10) / 10;
}

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-950";
const LABEL_CLASS =
  "space-y-1 text-[11px] font-black uppercase tracking-wide text-slate-600";

export function OfflineE14CaptureForm() {
  const confirm = useConfirmation();
  const vault = useOfflineVault();
  const [referenceTime] = useState(() => Date.now());
  const [form, setForm] = useState<E14FormState>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const grant = vault.e14Grant;
  const pendingE14 = vault.entries.filter(
    (entry) => entry.type === "E14_REPORT",
  );
  const selectedPlace = grant?.places.find(
    (place) => place.id === form.puestoId,
  );
  const contextLabel =
    grant?.captureContext === "SIMULATION" ? "SIMULACRO" : "REAL";
  const legacyWindowGrant = grant?.electionWindowSha256 === "0".repeat(64);
  const grantExpired = grant
    ? referenceTime >= Date.parse(grant.expiresAt) || legacyWindowGrant
    : false;
  const canProvision = vault.isOnline && !vault.busy && pendingE14.length === 0;
  const fileHelp = useMemo(
    () =>
      "PDF, JPG, JPEG, PNG o WEBP; máximo " +
      mib(OFFLINE_E14_MAX_FILE_BYTES) +
      " MiB.",
    [],
  );

  async function handleProvision() {
    setError(null);
    try {
      await vault.provisionE14();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible provisionar la capacidad E-14.",
      );
    }
  }

  async function handleRevoke() {
    const confirmed = await confirm({
      title: "Revocar capacidad E-14",
      description:
        "Se revocará esta capacidad E-14 de la bóveda. Las actas pendientes deben sincronizarse o eliminarse primero.",
      confirmLabel: "Revocar capacidad",
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      await vault.revokeE14();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible revocar la capacidad E-14.",
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError(null);
    setSaved(false);
    if (!grant || grantExpired || !selectedPlace || !file) {
      setError(
        "Falta una capacidad vigente, un puesto autorizado o el archivo del acta.",
      );
      return;
    }
    const voteBreakdown = {
      candidateVotes: integer(form.candidateVotes),
      blankVotes: integer(form.blankVotes),
      nullVotes: integer(form.nullVotes),
      unmarkedVotes: integer(form.unmarkedVotes),
      totalTableVotes: integer(form.totalTableVotes),
    };
    const voteValidation = validateWitnessVoteBreakdown(voteBreakdown);
    if (!voteValidation.valid) {
      setError(voteValidation.message);
      return;
    }
    if (form.hasWrittenClaim && !form.reclamationGround) {
      setError("Selecciona la causal de la reclamación escrita.");
      return;
    }

    const input: OfflineE14ReportInput = {
      puestoId: selectedPlace.id,
      mesa: integer(form.mesa),
      credentialType: form.credentialType,
      credentialReference: form.credentialReference.trim(),
      checkedInAt: new Date(form.checkedInAt).toISOString(),
      e14FormType: form.e14FormType,
      ...voteBreakdown,
      hasWrittenClaim: form.hasWrittenClaim,
      ...(form.hasWrittenClaim
        ? {
            reclamationGround:
              form.reclamationGround as WitnessReclamationGround,
            reclamationDescription: form.reclamationDescription.trim(),
          }
        : {}),
      ...(form.observations.trim()
        ? { observations: form.observations.trim() }
        : {}),
    };

    try {
      await vault.enqueueE14(input, file, new Date().toISOString());
      setForm(emptyForm());
      setFile(null);
      setSaved(true);
      formElement.reset();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "No fue posible cifrar el E-14.",
      );
    }
  }

  return (
    <section
      aria-labelledby="offline-e14-title"
      className="rounded-2xl border border-blue-200 bg-blue-50/50"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">
            Evidencia electoral privada
          </p>
          <h3 id="offline-e14-title" className="mt-1 text-sm font-black">
            Captura E-14 offline
          </h3>
        </div>
        {grant && (
          <span
            className={
              grant.captureContext === "SIMULATION"
                ? "rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-[10px] font-black text-violet-900"
                : "rounded-full border border-blue-300 bg-blue-100 px-3 py-1 text-[10px] font-black text-blue-900"
            }
          >
            {contextLabel}
          </span>
        )}
      </header>

      <div className="space-y-4 border-t border-blue-200 p-4">
        {!grant ? (
          <div className="space-y-3">
            <p className="text-xs leading-5 text-slate-700">
              Antes de desconectarte, solicita una capacidad opaca ligada a tu
              identidad, etapa, ventana documentada y puestos vigentes. Se
              guardará cifrada y no podrá cambiar una captura de simulacro a
              real.
            </p>
            <button
              type="button"
              onClick={() => void handleProvision()}
              disabled={!canProvision}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {vault.busy ? (
                <Loader2
                  aria-hidden="true"
                  className="animate-spin"
                  size={16}
                />
              ) : (
                <ShieldCheck aria-hidden="true" size={16} />
              )}
              Provisionar capacidad E-14
            </button>
            {!vault.isOnline && (
              <p className="text-xs font-semibold text-amber-900">
                Conéctate para provisionar; la API debe revalidar tu acceso.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-blue-200 bg-white p-3 text-xs leading-5 text-slate-700">
              <p className="font-black text-slate-950">
                Contexto {contextLabel} · elección {grant.electionDate}
              </p>
              <p>
                Ventana documental general: {grant.votingStartDate} a{" "}
                {grant.votingEndDate}, ambas fechas incluidas. Cada puesto REAL
                se habilita solamente en su propia fecha y zona horaria.
              </p>
              <p>
                Vence {new Date(grant.expiresAt).toLocaleString("es-CO")}. La
                hora del dispositivo no es prueba confiable: el servidor
                validará vigencia, identidad, etapa, puesto y mesa al recibir.
              </p>
              {legacyWindowGrant ? (
                <p className="mt-2 font-black text-red-800">
                  Esta capacidad es anterior al control de ventana electoral y
                  no admite nuevas capturas. Conserva cualquier evidencia ya
                  guardada y provisiona una capacidad vigente cuando la cola
                  quede vacía.
                </p>
              ) : grantExpired ? (
                <p className="mt-2 font-black text-red-800">
                  Capacidad vencida. Conserva la evidencia local y vuelve a
                  provisionar solo cuando no queden actas pendientes.
                </p>
              ) : null}
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
              >
                <AlertCircle
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  size={15}
                />
                {error}
              </p>
            )}
            {saved && (
              <p
                aria-live="polite"
                className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-white p-3 text-xs font-semibold text-emerald-800"
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                  size={15}
                />
                E-14 cifrado localmente. Aún no ha sido recibido por el
                servidor.
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={LABEL_CLASS}>
                  Puesto autorizado
                  <select
                    required
                    value={form.puestoId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        puestoId: event.target.value,
                        mesa: "",
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    <option value="">Selecciona un puesto</option>
                    {grant.places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.code} · {place.name}
                        {place.votingDate ? ` · ${place.votingDate}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={LABEL_CLASS}>
                  Mesa
                  <input
                    required
                    type="number"
                    min={1}
                    max={selectedPlace?.expectedTables ?? 0}
                    value={form.mesa}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        mesa: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
                {selectedPlace && (
                  <div className="rounded-xl border border-blue-200 bg-white p-3 text-xs normal-case leading-5 text-slate-700 sm:col-span-2">
                    <p className="font-black text-slate-950">
                      Jornada del puesto:{" "}
                      {selectedPlace.votingDate ?? "sin fecha documentada"} ·{" "}
                      {selectedPlace.timeZone ?? "zona horaria no verificada"}
                    </p>
                    <p>
                      Código físico fuente:{" "}
                      {selectedPlace.sourceLocationCode ?? "no disponible"}
                    </p>
                    {(selectedPlace.address || selectedPlace.commune) && (
                      <p>
                        {[selectedPlace.address, selectedPlace.commune]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    {grant.captureContext === "REAL" &&
                      (!selectedPlace.votingDate ||
                        !selectedPlace.timeZone) && (
                        <p className="mt-1 font-black text-red-800">
                          Bloqueado: un puesto REAL requiere fecha lógica y zona
                          IANA verificadas por la fuente.
                        </p>
                      )}
                  </div>
                )}
                <label className={LABEL_CLASS}>
                  Credencial
                  <select
                    value={form.credentialType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        credentialType: event.target
                          .value as WitnessCredentialType,
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    {Object.entries(WITNESS_CREDENTIAL_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className={LABEL_CLASS}>
                  Referencia de credencial
                  <input
                    required
                    maxLength={120}
                    autoComplete="off"
                    value={form.credentialReference}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        credentialReference: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  Hora de presencia
                  <input
                    required
                    type="datetime-local"
                    value={form.checkedInAt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        checkedInAt: event.target.value,
                      }))
                    }
                    className={FIELD_CLASS}
                  />
                </label>
                <label className={LABEL_CLASS}>
                  Ejemplar
                  <select
                    value={form.e14FormType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        e14FormType: event.target.value as E14FormType,
                      }))
                    }
                    className={FIELD_CLASS}
                  >
                    {Object.entries(E14_FORM_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <fieldset className="rounded-xl border border-slate-200 bg-white p-3">
                <legend className="px-1 text-[11px] font-black uppercase tracking-wide text-slate-600">
                  Lectura del acta
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ["candidateVotes", "Candidatura"],
                    ["blankVotes", "Blancos"],
                    ["nullVotes", "Nulos"],
                    ["unmarkedVotes", "No marcados"],
                    ["totalTableVotes", "Total mesa"],
                  ].map(([key, label]) => (
                    <label key={key} className={LABEL_CLASS}>
                      {label}
                      <input
                        required
                        type="number"
                        min={0}
                        max={99_999}
                        value={form[key as keyof E14FormState] as string}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        className={FIELD_CLASS}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950">
                <input
                  type="checkbox"
                  checked={form.hasWrittenClaim}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      hasWrittenClaim: event.target.checked,
                      reclamationGround: "",
                      reclamationDescription: "",
                    }))
                  }
                  className="mt-1 h-4 w-4"
                />
                Hubo reclamación escrita. Este registro interno no la radica
                ante la autoridad electoral.
              </label>
              {form.hasWrittenClaim && (
                <div className="space-y-3">
                  <label className={LABEL_CLASS}>
                    Causal
                    <select
                      required
                      value={form.reclamationGround}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reclamationGround: event.target
                            .value as WitnessReclamationGround,
                        }))
                      }
                      className={FIELD_CLASS}
                    >
                      <option value="">Selecciona la causal</option>
                      {Object.entries(WITNESS_RECLAMATION_GROUND_LABELS).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <label className={LABEL_CLASS}>
                    Descripción de la reclamación
                    <textarea
                      required
                      minLength={20}
                      maxLength={2000}
                      rows={3}
                      value={form.reclamationDescription}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          reclamationDescription: event.target.value,
                        }))
                      }
                      className={FIELD_CLASS + " py-3"}
                    />
                  </label>
                </div>
              )}

              <label className={LABEL_CLASS}>
                Observaciones opcionales
                <textarea
                  maxLength={1000}
                  rows={2}
                  value={form.observations}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      observations: event.target.value,
                    }))
                  }
                  className={FIELD_CLASS + " py-3"}
                />
              </label>

              <label className={LABEL_CLASS}>
                Archivo privado del E-14
                <span className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border border-dashed border-blue-300 bg-white px-3 py-3 normal-case tracking-normal">
                  <FileLock2
                    aria-hidden="true"
                    className="shrink-0 text-blue-700"
                    size={20}
                  />
                  <span>
                    <strong className="block text-xs text-slate-950">
                      {file?.name ?? "Seleccionar archivo"}
                    </strong>
                    <span className="block text-[11px] font-normal text-slate-600">
                      {fileHelp}
                    </span>
                  </span>
                  <input
                    required
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) =>
                      setFile(event.target.files?.[0] ?? null)
                    }
                  />
                </span>
              </label>

              <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-700">
                El archivo y metadatos quedan cifrados por bóveda; no se guarda
                el nombre original. Cola máxima: {OFFLINE_E14_MAX_QUEUE_ENTRIES}{" "}
                actas y {mib(OFFLINE_E14_MAX_TOTAL_BYTES)} MiB. La
                sincronización es manual, visible y en línea: el binario va
                directo al almacenamiento privado, nunca por NestJS.
              </p>

              <button
                type="submit"
                disabled={vault.busy || grantExpired}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileLock2 aria-hidden="true" size={16} />
                Guardar acta cifrada en este dispositivo
              </button>
            </form>

            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-5 text-slate-700">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-blue-700"
                size={16}
              />
              <p>
                “Recibido por el servidor” no significa resultado oficial,
                escrutinio, transmisión RNEC ni reclamación radicada. La copia
                local se elimina únicamente tras validar un recibo durable
                APPLIED o DUPLICATE de la operación exacta.
              </p>
            </div>

            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={!canProvision}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-red-200 px-3 text-[11px] font-black text-red-800 disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" size={14} />
              Revocar capacidad de esta bóveda
            </button>
          </>
        )}

        {!grant && error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-800"
          >
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 shrink-0"
              size={15}
            />
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
