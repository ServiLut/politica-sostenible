"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FilePenLine,
  Loader2,
  LockKeyhole,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  listAllVotingPlaces,
  type VotingPlace,
} from "@/lib/election-api";
import {
  exportVoter,
  getVoter,
  updateVoter,
  type UpdateVoterInput,
  type VoterDetail,
} from "@/lib/voters-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DetailForm {
  firstName: string;
  lastName: string;
  documentId: string;
  phone: string;
  email: string;
  mesa: string;
  puestoId: string;
}

const EMPTY_FORM: DetailForm = {
  firstName: "",
  lastName: "",
  documentId: "",
  phone: "",
  email: "",
  mesa: "",
  puestoId: "",
};

function detailToForm(voter: VoterDetail): DetailForm {
  return {
    firstName: voter.firstName,
    lastName: voter.lastName,
    documentId: voter.documentId,
    phone: voter.phone ?? "",
    email: voter.email ?? "",
    mesa: voter.mesa?.toString() ?? "",
    puestoId: voter.puesto?.id ?? "",
  };
}

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "No fue posible completar la operación.";
}

function validateForm(form: DetailForm): string | null {
  if (!form.firstName.trim() || form.firstName.trim().length > 100) {
    return "Los nombres son obligatorios y admiten máximo 100 caracteres.";
  }
  if (!form.lastName.trim() || form.lastName.trim().length > 100) {
    return "Los apellidos son obligatorios y admiten máximo 100 caracteres.";
  }
  if (
    !/^[\p{L}\p{N}.-]+$/u.test(form.documentId.trim()) ||
    form.documentId.trim().length > 30
  ) {
    return "El documento solo admite letras, números, punto y guion, hasta 30 caracteres.";
  }
  if (
    form.phone.trim() &&
    !/^\+?[0-9][0-9 .()-]{6,24}$/.test(form.phone.trim())
  ) {
    return "El teléfono no tiene un formato válido.";
  }
  if (
    form.email.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
  ) {
    return "El correo electrónico no tiene un formato válido.";
  }
  if (form.mesa) {
    const mesa = Number(form.mesa);
    if (!Number.isInteger(mesa) || mesa < 1 || mesa > 99_999) {
      return "La mesa debe ser un número entero entre 1 y 99999.";
    }
  }
  return null;
}

function formatDate(value: string | null): string {
  if (!value) return "No disponible";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function VoterDetailPanel({
  voterId,
  onClose,
  onUpdated,
}: {
  voterId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(false);
  const [voter, setVoter] = useState<VoterDetail | null>(null);
  const [form, setForm] = useState<DetailForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [places, setPlaces] = useState<VotingPlace[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [placesError, setPlacesError] = useState<string | null>(null);
  const [placesReload, setPlacesReload] = useState(0);
  const busy = saving || exporting;

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setVoter(null);

    const requestTimer = window.setTimeout(() => {
      void getVoter(voterId, controller.signal)
        .then((response) => {
          if (controller.signal.aborted) return;
          setVoter(response);
          setForm(detailToForm(response));
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          if (!controller.signal.aborted) setLoadError(readableError(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 0);

    return () => {
      window.clearTimeout(requestTimer);
      controller.abort();
    };
  }, [reload, voterId]);

  useEffect(() => {
    if (!editing) return;

    const controller = new AbortController();
    setPlacesLoading(true);
    setPlacesError(null);

    void listAllVotingPlaces(controller.signal)
      .then((response) => {
        if (!controller.signal.aborted) setPlaces(response);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (!controller.signal.aborted) setPlacesError(readableError(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setPlacesLoading(false);
      });

    return () => controller.abort();
  }, [editing, placesReload]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm(form);
    if (validationError) {
      setMutationError(validationError);
      return;
    }

    if (!voter) return;
    const normalized = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      documentId: form.documentId.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim().toLowerCase() || null,
      mesa: form.mesa ? Number(form.mesa) : null,
      puestoId: form.puestoId || null,
    };
    const input: UpdateVoterInput = {};
    if (normalized.firstName !== voter.firstName)
      input.firstName = normalized.firstName;
    if (normalized.lastName !== voter.lastName)
      input.lastName = normalized.lastName;
    if (normalized.documentId !== voter.documentId)
      input.documentId = normalized.documentId;
    if (normalized.phone !== voter.phone) input.phone = normalized.phone;
    if (normalized.email !== voter.email) input.email = normalized.email;
    if (normalized.mesa !== voter.mesa) input.mesa = normalized.mesa;
    if (normalized.puestoId !== (voter.puesto?.id ?? null))
      input.puestoId = normalized.puestoId;

    if (Object.keys(input).length === 0) {
      setMutationError("No hay cambios para guardar.");
      return;
    }

    setSaving(true);
    setMutationError(null);
    setNotice(null);
    try {
      const updated = await updateVoter(voterId, input);
      setVoter(updated);
      setForm(detailToForm(updated));
      setEditing(false);
      setNotice("Corrección guardada con trazabilidad de auditoría.");
      onUpdated();
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    setMutationError(null);
    setNotice(null);
    try {
      const exportData = await exportVoter(voterId);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `registro-personal-${voterId}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice("Ficha JSON generada para la consulta autorizada.");
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-sm sm:p-5">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="voter-detail-title"
        aria-busy={loading || busy}
        className="flex max-h-[95vh] w-full max-w-4xl flex-col overflow-hidden rounded-[2rem] bg-slate-50 shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white p-5 sm:p-7">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
              <LockKeyhole aria-hidden="true" size={13} /> Acceso restringido
            </div>
            <h2
              id="voter-detail-title"
              className="mt-3 text-2xl font-black tracking-tight text-slate-950"
            >
              Datos personales autorizados
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Consulta únicamente para una finalidad legítima. El acceso, las
              correcciones y la exportación quedan sujetos a auditoría.
            </p>
          </div>
          <Button
            ref={closeButtonRef}
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Cerrar detalle personal"
            disabled={busy}
            onClick={onClose}
            className="h-11 w-11 shrink-0 rounded-xl"
          >
            <X aria-hidden="true" size={20} />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
          {loading ? (
            <div
              role="status"
              className="flex min-h-80 flex-col items-center justify-center gap-3 text-sm font-bold text-slate-500"
            >
              <Loader2 className="animate-spin text-emerald-700" size={28} />
              Solicitando el detalle protegido…
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800"
            >
              <AlertCircle aria-hidden="true" size={30} />
              <div>
                <p className="font-black">No se pudo abrir el registro</p>
                <p className="mt-1 text-sm font-semibold">{loadError}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setReload((value) => value + 1)}
              >
                Reintentar
              </Button>
            </div>
          ) : voter ? (
            <div className="space-y-5">
              {(mutationError || notice) && (
                <div
                  role={mutationError ? "alert" : "status"}
                  aria-live="polite"
                  className={`flex items-start gap-2 rounded-2xl border p-4 text-sm font-bold ${
                    mutationError
                      ? "border-red-200 bg-red-50 text-red-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {mutationError ? (
                    <AlertCircle className="mt-0.5 shrink-0" size={17} />
                  ) : (
                    <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
                  )}
                  {mutationError ?? notice}
                </div>
              )}

              <Card className="border-amber-200 bg-amber-50/60">
                <CardContent className="flex items-start gap-3 p-4 text-xs font-semibold leading-5 text-amber-950 sm:p-5">
                  <Eye className="mt-0.5 shrink-0" aria-hidden="true" size={18} />
                  <p>
                    Los datos ya están visibles porque solicitaste abrir este
                    registro. No los copies a canales personales ni los uses
                    para una finalidad distinta a la autorizada.
                  </p>
                </CardContent>
              </Card>

              {editing ? (
                <form onSubmit={handleSave} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-600">
                      Nombres
                      <Input
                        required
                        maxLength={100}
                        value={form.firstName}
                        onChange={(event) =>
                          setForm({ ...form, firstName: event.target.value })
                        }
                        className="normal-case tracking-normal"
                      />
                    </Label>
                    <Label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-600">
                      Apellidos
                      <Input
                        required
                        maxLength={100}
                        value={form.lastName}
                        onChange={(event) =>
                          setForm({ ...form, lastName: event.target.value })
                        }
                        className="normal-case tracking-normal"
                      />
                    </Label>
                    <Label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-600">
                      Documento
                      <Input
                        required
                        maxLength={30}
                        value={form.documentId}
                        onChange={(event) =>
                          setForm({ ...form, documentId: event.target.value })
                        }
                        className="font-mono normal-case tracking-normal"
                      />
                    </Label>
                    <Label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-600">
                      Celular
                      <Input
                        type="tel"
                        maxLength={25}
                        value={form.phone}
                        onChange={(event) =>
                          setForm({ ...form, phone: event.target.value })
                        }
                        className="font-mono normal-case tracking-normal"
                      />
                    </Label>
                    <Label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-600">
                      Correo electrónico
                      <Input
                        type="email"
                        maxLength={254}
                        value={form.email}
                        onChange={(event) =>
                          setForm({ ...form, email: event.target.value })
                        }
                        className="normal-case tracking-normal"
                      />
                    </Label>
                    <Label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-600">
                      Mesa
                      <Input
                        type="number"
                        min={1}
                        max={99_999}
                        value={form.mesa}
                        onChange={(event) =>
                          setForm({ ...form, mesa: event.target.value })
                        }
                        className="normal-case tracking-normal"
                      />
                    </Label>
                    <Label className="space-y-2 text-xs font-black uppercase tracking-wider text-slate-600">
                      Puesto de votación
                      <select
                        value={form.puestoId}
                        disabled={placesLoading || Boolean(placesError)}
                        onChange={(event) =>
                          setForm({ ...form, puestoId: event.target.value })
                        }
                        className="min-h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-medium normal-case tracking-normal text-slate-900 shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <option value="">Sin puesto asignado</option>
                        {places.map((place) => (
                          <option key={place.id} value={place.id}>
                            {place.code} · {place.name}
                          </option>
                        ))}
                      </select>
                    </Label>
                  </div>
                  {placesLoading ? (
                    <div
                      role="status"
                      className="flex items-center gap-2 rounded-2xl bg-blue-50 p-4 text-xs font-bold text-blue-800"
                    >
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                        size={16}
                      />
                      Consultando puestos autorizados…
                    </div>
                  ) : placesError ? (
                    <div
                      role="alert"
                      className="flex flex-col items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-800 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span>
                        No fue posible consultar los puestos autorizados. El
                        puesto actual no será modificado.
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setPlacesReload((value) => value + 1)}
                      >
                        Reintentar puestos
                      </Button>
                    </div>
                  ) : places.length === 0 ? (
                    <p className="rounded-2xl bg-slate-100 p-4 text-xs font-semibold text-slate-700">
                      No hay puestos de votación disponibles en el alcance
                      autorizado.
                    </p>
                  ) : null}
                  <p className="rounded-2xl bg-slate-100 p-4 text-xs font-semibold leading-5 text-slate-700">
                    Corregir no cambia ni renueva el consentimiento. Los campos
                    vacíos de teléfono, correo, mesa o puesto se guardan como
                    no disponibles.
                  </p>
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={saving}
                      onClick={() => {
                        setForm(detailToForm(voter));
                        setMutationError(null);
                        setEditing(false);
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={saving}>
                      {saving ? (
                        <Loader2 className="mr-2 animate-spin" size={16} />
                      ) : (
                        <CheckCircle2 className="mr-2" size={16} />
                      )}
                      Guardar corrección
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {[
                      ["Nombre", `${voter.firstName} ${voter.lastName}`],
                      ["Documento", voter.documentId],
                      ["Celular", voter.phone ?? "No registrado"],
                      ["Correo", voter.email ?? "No registrado"],
                      ["Puesto", voter.puesto?.name ?? "No asignado"],
                      ["Mesa", voter.mesa?.toString() ?? "No asignada"],
                      [
                        "Consentimiento",
                        voter.consentAccepted ? "Vigente" : "Revocado",
                      ],
                      ["Autorizado", formatDate(voter.consentTimestamp)],
                      ["Aviso", voter.termsVersion ?? "No disponible"],
                      ["Última actualización", formatDate(voter.updatedAt)],
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-slate-200 bg-white p-4"
                      >
                        <dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                          {label}
                        </dt>
                        <dd className="mt-1 break-words text-sm font-bold text-slate-900">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={exporting}
                      onClick={() => void handleExport()}
                    >
                      {exporting ? (
                        <Loader2 className="mr-2 animate-spin" size={16} />
                      ) : (
                        <Download className="mr-2" size={16} />
                      )}
                      Exportar ficha JSON
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setMutationError(null);
                        setNotice(null);
                        setEditing(true);
                      }}
                    >
                      <FilePenLine className="mr-2" size={16} /> Corregir datos
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
