"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Database,
  ExternalLink,
  FileDiff,
  Fingerprint,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/auth";
import {
  activateCatalogRelease,
  CatalogIntegrityReport,
  catalogErrorMessage,
  CatalogReleaseDetail,
  CatalogReleaseDiff,
  CatalogReleaseGaps,
  diffCatalogRelease,
  ElectoralCatalogEntry,
  ElectoralCatalogRelease,
  ElectoralCatalogStatus,
  ElectoralCatalogType,
  getCatalogRelease,
  getCatalogReleaseGaps,
  listCatalogReleases,
  validateCatalogRelease,
} from "@/lib/electoral-catalog-api";
import { ElectoralCatalogImportPanel } from "@/components/electoral-catalog/ElectoralCatalogImportPanel";

const STATUS_LABELS: Record<ElectoralCatalogStatus, string> = {
  STAGED: "En preparación",
  VALIDATED: "Validado",
  ACTIVE: "Activo y operativo",
  SUPERSEDED: "Reemplazado",
  REJECTED: "Rechazado",
};

const STATUS_STYLES: Record<ElectoralCatalogStatus, string> = {
  STAGED: "border-amber-200 bg-amber-50 text-amber-900",
  VALIDATED: "border-blue-200 bg-blue-50 text-blue-900",
  ACTIVE: "border-emerald-200 bg-emerald-50 text-emerald-900",
  SUPERSEDED: "border-slate-200 bg-slate-100 text-slate-700",
  REJECTED: "border-red-200 bg-red-50 text-red-900",
};

const ENTRY_LABELS: Record<ElectoralCatalogEntry["type"], string> = {
  DEPARTMENT: "Departamento",
  MUNICIPALITY: "Municipio",
  NON_MUNICIPALIZED_AREA: "Área no municipalizada",
  ISLAND: "Isla",
  ZONE: "Zona",
  POLLING_PLACE: "Puesto",
};

const HASH_PATTERN = /^[a-f0-9]{64}$/;

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "No registrado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha inválida";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
    timeZone: "America/Bogota",
  }).format(date);
}

function shortHash(hash: string) {
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function releaseTypeLabel(type: ElectoralCatalogType) {
  return type === "ELECTORAL_RNEC"
    ? "Electoral RNEC · DIVIPOLE"
    : "Administrativo DANE · DIVIPOLA";
}

function count(value: number) {
  return value.toLocaleString("es-CO");
}

function verifiableCount(value: number | null) {
  return value === null ? "No verificable en release anterior" : count(value);
}

function Definition({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-bold text-slate-900">
        {value}
      </dd>
    </div>
  );
}

function IntegrityPanel({ integrity }: { integrity: CatalogIntegrityReport }) {
  const gapRows = [
    [
      "Departamentos sin municipios",
      integrity.gaps.departmentsWithoutMunicipalities,
    ],
    ["Municipios sin zonas", integrity.gaps.municipalitiesWithoutZones],
    ["Zonas sin puestos", integrity.gaps.zonesWithoutPollingPlaces],
    ["Puestos sin coordenadas", integrity.gaps.pollingPlacesWithoutCoordinates],
    ["Puestos sin comuna", integrity.gaps.pollingPlacesWithoutCommune],
    [
      "Registros de puesto/jornada sin dirección",
      integrity.gaps.pollingPlaceRecordsWithoutAddress,
    ],
  ] as const;

  return (
    <section
      className={`rounded-3xl border p-5 ${
        integrity.valid
          ? "border-emerald-200 bg-emerald-50"
          : "border-red-200 bg-red-50"
      }`}
      aria-labelledby="catalog-integrity-title"
    >
      <div className="flex items-start gap-3">
        {integrity.valid ? (
          <CheckCircle2
            className="shrink-0 text-emerald-700"
            aria-hidden="true"
          />
        ) : (
          <AlertCircle className="shrink-0 text-red-700" aria-hidden="true" />
        )}
        <div>
          <h3
            id="catalog-integrity-title"
            className="font-black text-slate-950"
          >
            {integrity.valid
              ? "Integridad estructural aprobada"
              : "Integridad estructural bloqueada"}
          </h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
            Este diagnóstico comprueba jerarquía, códigos y conteos. No
            reemplaza la verificación humana de actualidad, licencia ni
            autorización.
          </p>
        </div>
      </div>

      <dl className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {gapRows.map(([label, value]) => (
          <Definition key={label} label={label} value={count(value)} />
        ))}
      </dl>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Definition
          label="Ubicaciones físicas sin dirección"
          value={verifiableCount(
            integrity.gaps.physicalPollingPlacesWithoutAddress,
          )}
        />
        <Definition
          label="Ubicaciones físicas sin zona horaria verificable"
          value={verifiableCount(
            integrity.gaps.physicalPollingPlacesWithoutTimeZone,
          )}
        />
        <Definition
          label="Representaciones adicionales por jornada"
          value={verifiableCount(
            integrity.counts.additionalVotingDayRepresentations,
          )}
        />
      </dl>

      {integrity.blockingIssues.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-black uppercase tracking-wider text-red-900">
            Hallazgos bloqueantes
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-red-950">
            {integrity.blockingIssues.map((issue, index) => (
              <li key={`${issue}-${index}`}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function EntryTable({ entries }: { entries: ElectoralCatalogEntry[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-[1180px] w-full border-collapse text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase tracking-wider text-white">
          <tr>
            <th className="px-4 py-3">Nivel</th>
            <th className="px-4 py-3">Código canónico</th>
            <th className="px-4 py-3">Código fuente</th>
            <th className="px-4 py-3">Nombre</th>
            <th className="px-4 py-3">Jornada</th>
            <th className="px-4 py-3">Ubicación</th>
            <th className="px-4 py-3">Estado geográfico</th>
            <th className="px-4 py-3 text-right">Mesas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="px-4 py-3 font-bold text-slate-700">
                {ENTRY_LABELS[entry.type]}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-700">
                {entry.namespace}:{entry.canonicalCode}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-slate-700">
                {entry.sourceLocationCode ?? "—"}
              </td>
              <td className="px-4 py-3">
                <p className="font-bold text-slate-950">{entry.name}</p>
                {entry.nameIsDerived && (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Nombre derivado: requiere revisión humana
                  </p>
                )}
              </td>
              <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                <span className="block">{entry.votingDate ?? "No aplica"}</span>
                {entry.type === "POLLING_PLACE" && (
                  <span
                    className={`mt-1 block ${entry.timeZone ? "text-slate-500" : "font-black text-amber-700"}`}
                  >
                    {entry.timeZone ?? "Zona horaria exterior no verificada"}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-600">
                <span className="block font-semibold text-slate-800">
                  {entry.address || "Sin dirección publicada"}
                </span>
                {entry.commune && (
                  <span className="mt-1 block text-xs">{entry.commune}</span>
                )}
              </td>
              <td className="px-4 py-3 text-xs font-bold text-slate-700">
                {entry.type !== "POLLING_PLACE"
                  ? "No aplica"
                  : entry.latitude === null || entry.longitude === null
                    ? "Sin coordenadas publicadas utilizables"
                    : "Georreferenciado por la fuente"}
              </td>
              <td className="px-4 py-3 text-right font-bold text-slate-800">
                {entry.expectedTables ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ElectoralCatalogConsole() {
  const { user } = useAuth();
  const [typeFilter, setTypeFilter] = useState<ElectoralCatalogType | "">("");
  const [statusFilter, setStatusFilter] = useState<ElectoralCatalogStatus | "">(
    "",
  );
  const [releases, setReleases] = useState<ElectoralCatalogRelease[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogReleaseDetail | null>(null);
  const [gaps, setGaps] = useState<CatalogReleaseGaps | null>(null);
  const [diff, setDiff] = useState<CatalogReleaseDiff | null>(null);
  const [againstReleaseId, setAgainstReleaseId] = useState("");
  const [hashInput, setHashInput] = useState("");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [activationPhrase, setActivationPhrase] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [reviewing, setReviewing] = useState<"validate" | "activate" | null>(
    null,
  );
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadReleases = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingList(true);
      setListError(null);
      try {
        const loaded = await listCatalogReleases(
          {
            type: typeFilter || undefined,
            status: statusFilter || undefined,
            limit: 100,
          },
          signal,
        );
        setReleases(loaded);
        setSelectedId((current) =>
          current && loaded.some((release) => release.id === current)
            ? current
            : (loaded.at(0)?.id ?? null),
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setListError(catalogErrorMessage(error));
      } finally {
        if (!signal?.aborted) setLoadingList(false);
      }
    },
    [statusFilter, typeFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadReleases(controller.signal);
    return () => controller.abort();
  }, [loadReleases]);

  const loadDetail = useCallback(
    async (releaseId: string, signal?: AbortSignal) => {
      setLoadingDetail(true);
      setDetailError(null);
      setDiff(null);
      setDetail((current) =>
        current?.release.id === releaseId ? current : null,
      );
      setGaps((current) => (current?.releaseId === releaseId ? current : null));
      try {
        const [releaseDetail, releaseGaps] = await Promise.all([
          getCatalogRelease(releaseId, { entryLimit: 100 }, signal),
          getCatalogReleaseGaps(releaseId, signal),
        ]);
        setDetail(releaseDetail);
        setGaps(releaseGaps);
        setHashInput("");
        setReviewConfirmed(false);
        setActivationPhrase("");
        setAgainstReleaseId("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setDetailError(catalogErrorMessage(error));
      } finally {
        if (!signal?.aborted) setLoadingDetail(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setGaps(null);
      return;
    }
    setActionError(null);
    setNotice(null);
    const controller = new AbortController();
    void loadDetail(selectedId, controller.signal);
    return () => controller.abort();
  }, [loadDetail, selectedId]);

  const release = detail?.release ?? null;
  const matchingBases = useMemo(
    () =>
      release
        ? releases.filter(
            (candidate) =>
              candidate.id !== release.id &&
              candidate.catalogKey === release.catalogKey,
          )
        : [],
    [release, releases],
  );
  const hashMatches = Boolean(
    release &&
    HASH_PATTERN.test(hashInput) &&
    hashInput === release.contentSha256,
  );
  const activationConfirmation = release
    ? `ACTIVAR ${shortHash(release.contentSha256)}`
    : "";
  const isCreator = Boolean(release && user?.id === release.createdById);

  async function loadMoreEntries() {
    if (!detail?.pagination.nextCursorId || !release) return;
    setLoadingMore(true);
    setDetailError(null);
    try {
      const next = await getCatalogRelease(release.id, {
        entryLimit: 100,
        entryCursorId: detail.pagination.nextCursorId,
      });
      setDetail((current) =>
        current
          ? {
              ...next,
              entries: [...current.entries, ...next.entries],
            }
          : next,
      );
    } catch (error) {
      setDetailError(catalogErrorMessage(error));
    } finally {
      setLoadingMore(false);
    }
  }

  async function compareRelease() {
    if (!release) return;
    setLoadingDiff(true);
    setActionError(null);
    try {
      setDiff(
        await diffCatalogRelease(release.id, againstReleaseId || undefined),
      );
    } catch (error) {
      setDiff(null);
      setActionError(catalogErrorMessage(error));
    } finally {
      setLoadingDiff(false);
    }
  }

  async function reviewRelease(action: "validate" | "activate") {
    if (!release || !hashMatches || !reviewConfirmed) return;
    if (action === "activate" && activationPhrase !== activationConfirmation)
      return;
    setReviewing(action);
    setActionError(null);
    setNotice(null);
    try {
      const result =
        action === "validate"
          ? await validateCatalogRelease(release.id, hashInput)
          : await activateCatalogRelease(release.id, hashInput);
      setNotice(
        result.noOp
          ? "El servidor confirmó que el release ya estaba en el estado solicitado."
          : action === "validate"
            ? result.validated
              ? "Release validado. Aún no es operativo hasta que una segunda persona lo active."
              : "La validación terminó con hallazgos y el release fue rechazado."
            : "Release activado. La proyección territorial oficial quedó disponible.",
      );
      setReleases((current) =>
        current.map((item) =>
          item.id === result.release.id ? result.release : item,
        ),
      );
      await loadDetail(release.id);
    } catch (error) {
      setActionError(catalogErrorMessage(error));
    } finally {
      setReviewing(null);
    }
  }

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-800">
            <ShieldCheck size={13} aria-hidden="true" /> Control de fuente
            electoral
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Catálogo electoral verificable
          </h1>
          <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-slate-600">
            Revisa procedencia, integridad, brechas y cambios de cada snapshot
            antes de habilitar zonas y puestos. Solo un release{" "}
            <strong>Activo</strong> es operativo; preparar o validar datos no
            los convierte en oficiales.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadReleases()}
          disabled={loadingList}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={loadingList ? "animate-spin" : ""} size={16} />
          Actualizar
        </button>
      </header>

      <section>
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <TriangleAlert className="shrink-0" aria-hidden="true" />
            <div>
              <h2 className="font-black">
                La autorización de RNEC es obligatoria
              </h2>
              <p className="mt-2 text-sm font-semibold leading-6">
                Verifica por escrito autorización, licencia, fecha de corte y
                URL declarada de RNEC. Esta pantalla no acredita por sí sola
                permiso para reproducir o almacenar DIVIPOLE.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ElectoralCatalogImportPanel onReleaseAvailable={loadReleases} />

      {listError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-950"
        >
          {listError}{" "}
          {releases.length > 0 && "Se conserva el último listado visible."}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-950"
        >
          {notice}
        </div>
      )}
      {actionError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-950"
        >
          {actionError}
        </div>
      )}

      <section className="grid min-w-0 gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-4" aria-label="Releases electorales">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="font-black text-slate-950">Versiones disponibles</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="text-xs font-black uppercase tracking-wider text-slate-600">
                Fuente
                <select
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(
                      event.target.value as ElectoralCatalogType | "",
                    )
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-900"
                >
                  <option value="">Todas</option>
                  <option value="ELECTORAL_RNEC">RNEC · DIVIPOLE</option>
                  <option value="ADMINISTRATIVE_DANE">DANE · DIVIPOLA</option>
                </select>
              </label>
              <label className="text-xs font-black uppercase tracking-wider text-slate-600">
                Estado
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(
                      event.target.value as ElectoralCatalogStatus | "",
                    )
                  }
                  className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-900"
                >
                  <option value="">Todos</option>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {loadingList && releases.length === 0 ? (
            <div
              role="status"
              className="flex min-h-40 items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white font-bold text-slate-500"
            >
              <Loader2 className="animate-spin" aria-hidden="true" />{" "}
              Consultando…
            </div>
          ) : releases.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-6 text-center">
              <Database
                className="mx-auto text-slate-300"
                size={38}
                aria-hidden="true"
              />
              <h3 className="mt-3 font-black text-slate-950">
                No hay releases
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                No se generan zonas ni puestos de ejemplo. Confirma filtros o
                gestiona la ingesta segura con el equipo técnico autorizado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {releases.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    selectedId === item.id
                      ? "border-blue-500 bg-blue-50 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <span
                    className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[item.status]}`}
                  >
                    {STATUS_LABELS[item.status]}
                  </span>
                  <span className="mt-3 block break-words font-black text-slate-950">
                    {item.sourceDataset}
                  </span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">
                    {releaseTypeLabel(item.type)}
                  </span>
                  <span className="mt-3 grid gap-1 text-[11px] font-semibold leading-5 text-slate-600">
                    <span>Fuente: {item.sourceOrganization}</span>
                    <span>Corte: {formatDate(item.sourceCutoffAt)}</span>
                    <span>Elección: {formatDate(item.electionDate)}</span>
                    <span>
                      Autorización:{" "}
                      {item.authorizationReference ?? "No registrada"}
                    </span>
                    <span>
                      Licencia: {item.licenseDeclaration ?? "No registrada"}
                    </span>
                    <span className="break-all">
                      Creador: {item.createdById}
                    </span>
                    <span className="break-all">
                      Revisor: {item.validatedById ?? "Pendiente"}
                    </span>
                    <span className="break-all">
                      Aprobador: {item.approvedById ?? "Pendiente"}
                    </span>
                  </span>
                  <span className="mt-3 block font-mono text-[11px] text-slate-600">
                    {shortHash(item.contentSha256)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          {detailError && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-950"
            >
              {detailError}
            </div>
          )}
          {loadingDetail ? (
            <div
              role="status"
              className="flex min-h-96 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white font-bold text-slate-500"
            >
              <Loader2 className="animate-spin" aria-hidden="true" />{" "}
              Verificando snapshot…
            </div>
          ) : !release ? (
            <div className="flex min-h-96 flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <Fingerprint
                className="text-slate-300"
                size={46}
                aria-hidden="true"
              />
              <h2 className="mt-4 font-black text-slate-950">
                Selecciona una versión
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Aquí aparecerán su procedencia, huella, diferencias y controles.
              </p>
            </div>
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${STATUS_STYLES[release.status]}`}
                    >
                      {STATUS_LABELS[release.status]}
                    </span>
                    <h2 className="mt-3 break-words text-2xl font-black text-slate-950">
                      {release.sourceDataset}
                    </h2>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {releaseTypeLabel(release.type)} · {release.catalogKey}
                    </p>
                  </div>
                  <a
                    href={release.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black uppercase tracking-wider text-blue-800 hover:bg-slate-50"
                  >
                    Fuente declarada{" "}
                    <ExternalLink size={15} aria-hidden="true" />
                  </a>
                </div>

                {release.status !== "ACTIVE" && (
                  <div
                    role="status"
                    className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-black text-amber-950"
                  >
                    No operativo: este snapshot no puede respaldar zonas,
                    puestos ni decisiones de jornada hasta quedar Activo.
                  </div>
                )}

                <dl className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <Definition
                    label="Organización fuente"
                    value={release.sourceOrganization}
                  />
                  <Definition
                    label="Fecha de corte"
                    value={formatDate(release.sourceCutoffAt)}
                  />
                  <Definition
                    label="Fecha electoral"
                    value={formatDate(release.electionDate)}
                  />
                  <Definition
                    label="Creado"
                    value={formatDate(release.createdAt, true)}
                  />
                  <Definition
                    label="Validado"
                    value={formatDate(release.validatedAt, true)}
                  />
                  <Definition
                    label="Activado"
                    value={formatDate(release.activatedAt, true)}
                  />
                  <Definition
                    label="Creador (ID auditado)"
                    value={release.createdById}
                  />
                  <Definition
                    label="Revisor de validación (ID)"
                    value={release.validatedById ?? "Pendiente"}
                  />
                  <Definition
                    label="Aprobador / activador (ID)"
                    value={
                      release.approvedById ??
                      release.activatedById ??
                      "Pendiente"
                    }
                  />
                  <Definition label="Parser" value={release.parserVersion} />
                  <Definition
                    label="Autorización"
                    value={release.authorizationReference ?? "No registrada"}
                  />
                  <Definition
                    label="Licencia declarada"
                    value={release.licenseDeclaration ?? "No registrada"}
                  />
                </dl>

                <div className="mt-5 rounded-2xl bg-slate-950 p-4 text-white">
                  <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-300">
                    <Fingerprint size={15} aria-hidden="true" /> SHA-256 del
                    contenido
                  </p>
                  <code className="mt-2 block break-all text-xs leading-6 text-blue-200">
                    {release.contentSha256}
                  </code>
                </div>

                {release.rejectionReason && (
                  <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-950">
                    <strong>Motivo de rechazo:</strong>{" "}
                    {release.rejectionReason}
                  </div>
                )}
              </section>

              {gaps && <IntegrityPanel integrity={gaps.integrity} />}

              <section
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                aria-labelledby="catalog-diff-title"
              >
                <div className="flex items-start gap-3">
                  <FileDiff
                    className="shrink-0 text-indigo-700"
                    aria-hidden="true"
                  />
                  <div>
                    <h3
                      id="catalog-diff-title"
                      className="font-black text-slate-950"
                    >
                      Comparar versiones
                    </h3>
                    <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                      Revisa altas, retiros y cambios antes de aprobar. Los
                      retiros con datos relacionados requieren crosswalk y el
                      servidor los bloqueará.
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                  <label className="flex-1 text-xs font-black uppercase tracking-wider text-slate-600">
                    Versión base
                    <select
                      value={againstReleaseId}
                      onChange={(event) =>
                        setAgainstReleaseId(event.target.value)
                      }
                      className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold normal-case tracking-normal text-slate-900"
                    >
                      <option value="">Anterior elegible (automática)</option>
                      {matchingBases.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {STATUS_LABELS[candidate.status]} ·{" "}
                          {formatDate(candidate.createdAt)} ·{" "}
                          {shortHash(candidate.contentSha256)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    onClick={() => void compareRelease()}
                    disabled={loadingDiff}
                    className="min-h-11 self-end rounded-xl bg-indigo-800 px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {loadingDiff ? "Comparando…" : "Comparar"}
                  </button>
                </div>
                {diff && (
                  <div className="mt-5 space-y-4" aria-live="polite">
                    <p className="text-sm font-semibold text-slate-700">
                      Base:{" "}
                      {diff.base
                        ? shortHash(diff.base.sha256)
                        : "sin versión anterior"}
                    </p>
                    <dl className="grid grid-cols-3 gap-2">
                      <Definition
                        label="Agregados"
                        value={count(diff.summary.added)}
                      />
                      <Definition
                        label="Retirados"
                        value={count(diff.summary.removed)}
                      />
                      <Definition
                        label="Modificados"
                        value={count(diff.summary.changed)}
                      />
                    </dl>
                    {diff.sample.truncated && (
                      <p className="rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">
                        Muestra truncada a {count(diff.sample.limit)} elementos
                        por grupo.
                      </p>
                    )}
                    {(diff.sample.added.length > 0 ||
                      diff.sample.removed.length > 0 ||
                      diff.sample.changed.length > 0) && (
                      <div className="grid gap-3 lg:grid-cols-3">
                        <DiffList title="Agregados" items={diff.sample.added} />
                        <DiffList
                          title="Retirados"
                          items={diff.sample.removed}
                        />
                        <DiffList
                          title="Modificados"
                          items={diff.sample.changed.map(
                            (item) =>
                              `${item.code} · ${item.fields.join(", ")}`,
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}
              </section>

              {(release.status === "STAGED" ||
                release.status === "VALIDATED") && (
                <section
                  className="rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:p-6"
                  aria-labelledby="catalog-review-title"
                >
                  <div className="flex items-start gap-3">
                    <ShieldCheck
                      className="shrink-0 text-blue-800"
                      aria-hidden="true"
                    />
                    <div>
                      <h3
                        id="catalog-review-title"
                        className="font-black text-blue-950"
                      >
                        Control humano irreversible
                      </h3>
                      <p className="mt-1 text-sm font-semibold leading-6 text-blue-950/75">
                        Copia la huella mostrada arriba. El backend rechazará
                        una huella desactualizada, otra organización, una cuenta
                        inactiva o una activación sin segunda persona.
                      </p>
                    </div>
                  </div>

                  <label className="mt-5 block text-xs font-black uppercase tracking-wider text-blue-950">
                    SHA-256 revisado (64 caracteres)
                    <input
                      value={hashInput}
                      onChange={(event) =>
                        setHashInput(event.target.value.trim().toLowerCase())
                      }
                      maxLength={64}
                      autoComplete="off"
                      spellCheck={false}
                      className="mt-2 min-h-12 w-full rounded-xl border border-blue-200 bg-white px-4 font-mono text-xs normal-case tracking-normal text-slate-950 outline-none focus:border-blue-600"
                    />
                  </label>
                  <label className="mt-4 flex items-start gap-3 rounded-2xl border border-blue-200 bg-white p-4 text-sm font-semibold leading-6 text-slate-800">
                    <input
                      type="checkbox"
                      checked={reviewConfirmed}
                      onChange={(event) =>
                        setReviewConfirmed(event.target.checked)
                      }
                      className="mt-1 h-4 w-4 shrink-0 accent-blue-700"
                    />
                    <span>
                      Confirmo que comparé la huella completa, la URL declarada
                      de RNEC, la fecha electoral, la fecha de corte, la
                      autorización, la licencia, las brechas y el diff del
                      release seleccionado.
                    </span>
                  </label>

                  {release.status === "VALIDATED" && (
                    <label className="mt-4 block text-xs font-black uppercase tracking-wider text-blue-950">
                      Escribe exactamente: {activationConfirmation}
                      <input
                        value={activationPhrase}
                        onChange={(event) =>
                          setActivationPhrase(event.target.value)
                        }
                        autoComplete="off"
                        className="mt-2 min-h-12 w-full rounded-xl border border-blue-200 bg-white px-4 text-sm font-bold normal-case tracking-normal text-slate-950 outline-none focus:border-blue-600"
                      />
                    </label>
                  )}

                  {isCreator && release.status === "VALIDATED" && (
                    <div
                      role="status"
                      className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-bold text-amber-950"
                    >
                      Tu cuenta creó este release. Debe activarlo otra persona
                      vigente de Administración, Cumplimiento o Auditoría.
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      void reviewRelease(
                        release.status === "STAGED" ? "validate" : "activate",
                      )
                    }
                    disabled={
                      reviewing !== null ||
                      !hashMatches ||
                      !reviewConfirmed ||
                      (release.status === "VALIDATED" &&
                        (isCreator ||
                          activationPhrase !== activationConfirmation))
                    }
                    className={`mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-5 text-xs font-black uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto ${
                      release.status === "STAGED"
                        ? "bg-blue-800 hover:bg-blue-700"
                        : "bg-red-700 hover:bg-red-600"
                    }`}
                  >
                    {reviewing ? (
                      <Loader2
                        className="animate-spin"
                        size={17}
                        aria-hidden="true"
                      />
                    ) : (
                      <ArrowRight size={17} aria-hidden="true" />
                    )}
                    {reviewing
                      ? "Procesando…"
                      : release.status === "STAGED"
                        ? "Validar estructura"
                        : "Aprobar y activar"}
                  </button>
                </section>
              )}

              <section
                className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
                aria-labelledby="catalog-entries-title"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h3
                      id="catalog-entries-title"
                      className="font-black text-slate-950"
                    >
                      Entradas del snapshot
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {count(detail?.entries.length ?? 0)} cargadas de{" "}
                      {count(release.recordCount)} declaradas.
                    </p>
                  </div>
                  <p className="text-xs font-bold text-slate-500">
                    {count(release.departmentCount)} dptos. ·{" "}
                    {count(release.municipalityCount)} municipios ·{" "}
                    {count(release.zoneCount)} zonas ·{" "}
                    {count(release.pollingPlaceCount)} registros de
                    puesto/jornada ·{" "}
                    {verifiableCount(release.physicalPollingPlaceCount)}{" "}
                    ubicaciones físicas · {count(release.expectedTableCount)}{" "}
                    mesas
                  </p>
                </div>
                <div className="mt-5">
                  <EntryTable entries={detail?.entries ?? []} />
                </div>
                {detail?.pagination.hasMore && (
                  <button
                    type="button"
                    onClick={() => void loadMoreEntries()}
                    disabled={loadingMore}
                    className="mt-4 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-5 text-xs font-black uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {loadingMore ? "Cargando…" : "Cargar 100 entradas más"}
                  </button>
                )}
              </section>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function DiffList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="mt-2 text-xs font-semibold text-slate-500">Sin cambios</p>
      ) : (
        <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-700">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="break-all">
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
