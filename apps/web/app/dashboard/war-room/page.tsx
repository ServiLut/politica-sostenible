"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  Vote,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { uploadFileDirectly } from "@/lib/direct-storage-upload";
import {
  createWitnessReport,
  listVotingPlaces,
  listWitnessReports,
  VotingPlace,
  VotingPlacePage,
  WitnessReport,
} from "@/lib/election-api";

const EMPTY_FORM = {
  puestoId: "",
  mesa: "",
  candidateVotes: "",
  totalTableVotes: "",
  observations: "",
};

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-CO").format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function placeName(
  report: WitnessReport,
  placesById: ReadonlyMap<string, VotingPlace>,
): string {
  return (
    report.puesto?.name ??
    placesById.get(report.puestoId)?.name ??
    "Puesto no disponible"
  );
}

export default function WarRoomPage() {
  const [placesPage, setPlacesPage] = useState<VotingPlacePage | null>(null);
  const [reports, setReports] = useState<WitnessReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [savingStep, setSavingStep] = useState<
    "uploading" | "reporting" | null
  >(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [e14File, setE14File] = useState<File | null>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);

    try {
      const [loadedPlaces, loadedReports] = await Promise.all([
        listVotingPlaces(signal),
        listWitnessReports(signal),
      ]);

      setPlacesPage(loadedPlaces);
      setReports(loadedReports);
      setForm((current) => {
        const selectedPlaceStillExists = loadedPlaces.items.some(
          (place) => place.id === current.puestoId,
        );

        return {
          ...current,
          puestoId: selectedPlaceStillExists
            ? current.puestoId
            : (loadedPlaces.items[0]?.id ?? ""),
        };
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(
        readableError(
          error,
          "No fue posible consultar los puestos y reportes electorales.",
        ),
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  useEffect(() => {
    if (!dialogOpen) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    dialogTitleRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingStep) setDialogOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousActiveElement?.focus();
    };
  }, [dialogOpen, savingStep]);

  const places = useMemo(() => placesPage?.items ?? [], [placesPage]);
  const placesById = useMemo(
    () => new Map(places.map((place) => [place.id, place])),
    [places],
  );
  const metrics = useMemo(
    () =>
      reports.reduce(
        (totals, report) => ({
          reports: totals.reports + 1,
          candidateVotes: totals.candidateVotes + report.candidateVotes,
          totalVotes: totals.totalVotes + report.totalTableVotes,
        }),
        { reports: 0, candidateVotes: 0, totalVotes: 0 },
      ),
    [reports],
  );
  const reportsByPlace = useMemo(() => {
    const grouped = new Map<
      string,
      { reports: number; candidateVotes: number; totalVotes: number }
    >();

    for (const report of reports) {
      const current = grouped.get(report.puestoId) ?? {
        reports: 0,
        candidateVotes: 0,
        totalVotes: 0,
      };
      grouped.set(report.puestoId, {
        reports: current.reports + 1,
        candidateVotes: current.candidateVotes + report.candidateVotes,
        totalVotes: current.totalVotes + report.totalTableVotes,
      });
    }

    return grouped;
  }, [reports]);

  function openReportDialog(puestoId?: string) {
    if (places.length === 0) return;

    setFormError(null);
    setNotice(null);
    setForm((current) => ({
      ...current,
      puestoId: puestoId ?? current.puestoId ?? places[0].id,
    }));
    setDialogOpen(true);
  }

  function closeReportDialog() {
    if (savingStep) return;
    setDialogOpen(false);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const mesa = Number(form.mesa);
    const candidateVotes = Number(form.candidateVotes);
    const totalTableVotes = Number(form.totalTableVotes);

    if (!placesById.has(form.puestoId)) {
      setFormError("Selecciona un puesto de votación disponible.");
      return;
    }

    if (
      !Number.isInteger(mesa) ||
      mesa < 1 ||
      !Number.isInteger(candidateVotes) ||
      candidateVotes < 0 ||
      !Number.isInteger(totalTableVotes) ||
      totalTableVotes < 0
    ) {
      setFormError(
        "Mesa y votos deben ser números enteros dentro de los rangos permitidos.",
      );
      return;
    }

    if (candidateVotes > totalTableVotes) {
      setFormError(
        "Los votos del candidato no pueden superar el total de votos de la mesa.",
      );
      return;
    }

    if (!e14File) {
      setFormError(
        "Adjunta el acta E-14 en PDF o imagen antes de enviar el reporte.",
      );
      return;
    }

    try {
      setSavingStep("uploading");
      const upload = await uploadFileDirectly(e14File, "e14");

      setSavingStep("reporting");
      await createWitnessReport({
        puestoId: form.puestoId,
        mesa,
        candidateVotes,
        totalTableVotes,
        e14ImageUrl: upload.path,
        ...(form.observations.trim()
          ? { observations: form.observations.trim() }
          : {}),
      });

      setForm({
        ...EMPTY_FORM,
        puestoId: places[0]?.id ?? "",
      });
      setE14File(null);
      setDialogOpen(false);
      setNotice("Reporte E-14 registrado con soporte privado confirmado.");
      await loadData();
    } catch (error) {
      setFormError(
        readableError(error, "No fue posible registrar el reporte E-14."),
      );
    } finally {
      setSavingStep(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-wider text-blue-700">
            <ShieldCheck aria-hidden="true" size={14} /> Reportes verificables
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Control de reportes E-14
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Consolida actas reportadas por testigos. Todos los valores de este
            tablero provienen de reportes guardados en la API.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:border-blue-300 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={loading ? "animate-spin" : ""}
              size={17}
            />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => openReportDialog()}
            disabled={loading || places.length === 0}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-lg shadow-blue-900/10 transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Plus aria-hidden="true" size={18} /> Registrar E-14
          </button>
        </div>
      </header>

      {notice && (
        <div
          aria-live="polite"
          className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-900"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" size={19} /> {notice}
          </span>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="Cerrar confirmación"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      )}

      {loading ? (
        <div
          role="status"
          className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-semibold text-slate-500"
        >
          <Loader2
            aria-hidden="true"
            className="animate-spin text-blue-700"
            size={30}
          />
          Consultando puestos y reportes reales…
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex min-h-80 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center"
        >
          <AlertCircle aria-hidden="true" className="text-red-600" size={34} />
          <div>
            <h2 className="font-black text-slate-950">
              No pudimos cargar el control electoral
            </h2>
            <p className="mt-1 max-w-xl text-sm text-slate-600">{loadError}</p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-blue-800"
          >
            <RefreshCw aria-hidden="true" size={16} /> Reintentar
          </button>
        </div>
      ) : (
        <>
          <section
            aria-label="Métricas de reportes"
            className="grid gap-4 md:grid-cols-3"
          >
            <article className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
              <FileCheck2
                aria-hidden="true"
                className="text-blue-300"
                size={24}
              />
              <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">
                Reportes recibidos
              </p>
              <p
                data-testid="reports-metric"
                className="mt-2 text-4xl font-black tracking-tight"
              >
                {formatNumber(metrics.reports)}
              </p>
              <p className="mt-2 text-xs text-slate-400">
                Actas guardadas por testigos autenticados
              </p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <Vote aria-hidden="true" className="text-blue-700" size={24} />
              <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">
                Votos del candidato
              </p>
              <p
                data-testid="candidate-votes-metric"
                className="mt-2 text-4xl font-black tracking-tight text-slate-950"
              >
                {formatNumber(metrics.candidateVotes)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Suma de los reportes registrados
              </p>
            </article>
            <article className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <BarChart3
                aria-hidden="true"
                className="text-emerald-700"
                size={24}
              />
              <p className="mt-5 text-xs font-black uppercase tracking-wider text-slate-400">
                Votos totales
              </p>
              <p
                data-testid="total-votes-metric"
                className="mt-2 text-4xl font-black tracking-tight text-slate-950"
              >
                {formatNumber(metrics.totalVotes)}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Total informado en las mesas reportadas
              </p>
            </article>
          </section>

          <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <AlertCircle
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-blue-700"
              size={19}
            />
            <p>
              <strong>Cobertura no disponible.</strong> La API todavía no
              publica el total oficial de mesas habilitadas; por eso este
              tablero no calcula ni muestra porcentajes estimados.
            </p>
          </div>

          {places.length === 0 ? (
            <section className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-center">
              <MapPin
                aria-hidden="true"
                className="mx-auto text-amber-600"
                size={40}
              />
              <h2 className="mt-4 text-xl font-black text-slate-950">
                No hay puestos de votación configurados
              </h2>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                No es posible registrar un E-14 hasta que la organización cargue
                puestos territoriales de tipo PUESTO. Contacta a una persona
                administradora para completar esa configuración.
              </p>
            </section>
          ) : (
            <section aria-labelledby="places-heading" className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2
                    id="places-heading"
                    className="text-xl font-black text-slate-950"
                  >
                    Puestos disponibles
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatNumber(
                      placesPage?.pagination.total ?? places.length,
                    )}{" "}
                    puestos encontrados en la API.
                  </p>
                </div>
                {(placesPage?.pagination.total ?? 0) > places.length && (
                  <p className="text-xs font-semibold text-slate-500">
                    Mostrando los primeros {places.length} puestos.
                  </p>
                )}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {places.map((place) => {
                  const placeReports = reportsByPlace.get(place.id) ?? {
                    reports: 0,
                    candidateVotes: 0,
                    totalVotes: 0,
                  };
                  return (
                    <article
                      key={place.id}
                      data-testid={`place-card-${place.id}`}
                      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-xl bg-blue-50 p-2 text-blue-700">
                          <MapPin aria-hidden="true" size={20} />
                        </span>
                        <span className="font-mono text-xs font-black text-slate-400">
                          {place.code}
                        </span>
                      </div>
                      <h3 className="mt-4 font-black text-slate-950">
                        {place.name}
                      </h3>
                      {place.parent && (
                        <p className="mt-1 text-xs text-slate-500">
                          {place.parent.name}
                        </p>
                      )}
                      <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4 text-center">
                        <div>
                          <dt className="text-[10px] font-black uppercase text-slate-400">
                            Reportes
                          </dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {placeReports.reports}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-black uppercase text-slate-400">
                            Candidato
                          </dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {formatNumber(placeReports.candidateVotes)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] font-black uppercase text-slate-400">
                            Total
                          </dt>
                          <dd className="mt-1 font-black text-slate-900">
                            {formatNumber(placeReports.totalVotes)}
                          </dd>
                        </div>
                      </dl>
                      <button
                        type="button"
                        onClick={() => openReportDialog(place.id)}
                        className="mt-5 min-h-11 w-full rounded-xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-blue-800"
                      >
                        Reportar mesa
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section
            aria-labelledby="reports-heading"
            className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
          >
            <header className="border-b border-slate-100 bg-slate-50/60 px-6 py-5">
              <h2 id="reports-heading" className="font-black text-slate-950">
                Reportes registrados
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                La ruta privada del acta nunca se expone en esta vista.
              </p>
            </header>
            {reports.length === 0 ? (
              <div className="px-6 py-16 text-center">
                <ClipboardList
                  aria-hidden="true"
                  className="mx-auto text-slate-300"
                  size={42}
                />
                <h3 className="mt-4 font-black text-slate-950">
                  Aún no hay reportes E-14
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Las métricas permanecerán en cero hasta recibir el primer
                  reporte real.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-white text-xs font-black uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Puesto / mesa</th>
                      <th className="px-6 py-4">Testigo</th>
                      <th className="px-6 py-4 text-right">Votos candidato</th>
                      <th className="px-6 py-4 text-right">Votos totales</th>
                      <th className="px-6 py-4">Soporte</th>
                      <th className="px-6 py-4">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.map((report) => (
                      <tr
                        key={report.id}
                        data-testid={`report-row-${report.id}`}
                        className="hover:bg-slate-50/70"
                      >
                        <td className="px-6 py-5">
                          <p className="font-black text-slate-900">
                            {placeName(report, placesById)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Mesa {report.mesa}
                          </p>
                        </td>
                        <td className="px-6 py-5 font-semibold text-slate-600">
                          {report.witness?.name ?? "Testigo autenticado"}
                        </td>
                        <td className="px-6 py-5 text-right font-black text-blue-800">
                          {formatNumber(report.candidateVotes)}
                        </td>
                        <td className="px-6 py-5 text-right font-black text-slate-900">
                          {formatNumber(report.totalTableVotes)}
                        </td>
                        <td className="px-6 py-5">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">
                            <FileCheck2 aria-hidden="true" size={14} /> Privado
                            confirmado
                          </span>
                        </td>
                        <td className="px-6 py-5 text-xs text-slate-500">
                          {formatDate(report.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {dialogOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="e14-dialog-title"
            className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2
                  id="e14-dialog-title"
                  ref={dialogTitleRef}
                  tabIndex={-1}
                  className="text-xl font-black text-slate-950 outline-none"
                >
                  Registrar reporte de mesa
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  El acta se carga directamente al almacenamiento privado.
                </p>
              </div>
              <button
                type="button"
                onClick={closeReportDialog}
                disabled={Boolean(savingStep)}
                aria-label="Cerrar formulario"
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
              >
                <X aria-hidden="true" size={21} />
              </button>
            </header>
            <form onSubmit={handleSubmit} className="space-y-5 p-6">
              {formError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800"
                >
                  {formError}
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-black text-slate-800 sm:col-span-2">
                  Puesto de votación
                  <select
                    required
                    value={form.puestoId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        puestoId: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  >
                    <option value="" disabled>
                      Seleccionar puesto
                    </option>
                    {places.map((place) => (
                      <option key={place.id} value={place.id}>
                        {place.code} · {place.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-black text-slate-800">
                  Número de mesa
                  <input
                    required
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form.mesa}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        mesa: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <div aria-hidden="true" className="hidden sm:block" />
                <label className="text-sm font-black text-slate-800">
                  Votos del candidato
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={form.candidateVotes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        candidateVotes: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-blue-200 px-4 font-normal text-blue-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
                <label className="text-sm font-black text-slate-800">
                  Votos totales de la mesa
                  <input
                    required
                    type="number"
                    min={0}
                    step={1}
                    inputMode="numeric"
                    value={form.totalTableVotes}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        totalTableVotes: event.target.value,
                      }))
                    }
                    className="mt-2 min-h-12 w-full rounded-2xl border border-slate-200 px-4 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  />
                </label>
              </div>
              <label className="block text-sm font-black text-slate-800">
                Observaciones{" "}
                <span className="font-normal text-slate-400">(opcional)</span>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={form.observations}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      observations: event.target.value,
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </label>
              <label className="block text-sm font-black text-slate-800">
                Acta E-14 privada
                <span className="mt-2 flex min-h-20 cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 font-normal text-slate-700 transition hover:bg-blue-50">
                  <UploadCloud
                    aria-hidden="true"
                    className="shrink-0 text-blue-700"
                    size={24}
                  />
                  <span>
                    <strong className="block text-sm">
                      {e14File?.name ?? "Seleccionar PDF o imagen"}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-500">
                      El archivo no atraviesa el servidor NestJS.
                    </span>
                  </span>
                  <input
                    required
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) =>
                      setE14File(event.target.files?.[0] ?? null)
                    }
                  />
                </span>
              </label>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
                <FileText
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-slate-500"
                  size={17}
                />
                Sólo se enviará a la API la ruta privada confirmada del E-14
                junto con los datos numéricos del reporte.
              </div>
              <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeReportDialog}
                  disabled={Boolean(savingStep)}
                  className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={Boolean(savingStep)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-6 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-60"
                >
                  {savingStep ? (
                    <Loader2
                      aria-hidden="true"
                      className="animate-spin"
                      size={17}
                    />
                  ) : (
                    <ShieldCheck aria-hidden="true" size={17} />
                  )}
                  {savingStep === "uploading"
                    ? "Subiendo acta…"
                    : savingStep === "reporting"
                      ? "Guardando reporte…"
                      : "Enviar reporte"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
