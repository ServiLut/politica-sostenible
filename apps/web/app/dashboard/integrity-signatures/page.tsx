"use client";

import { usePageRequest } from "@/lib/use-page-request";

import { Button, Input, Label } from "@/components/ui";
import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  listSigningCandidates,
  signElectronicDocument,
  verifyElectronicSignature,
  type ElectronicSignatureCandidate,
  type ElectronicSignatureModule,
  type ElectronicSignatureVerification,
} from "@/lib/electronic-signature-api";
import {
  CheckCircle2,
  FileSignature,
  Loader2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

const FINANCE_SIGN_ROLES = new Set([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "FINANCE_MANAGER",
]);
const E14_SIGN_ROLES = new Set([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "ZONE_COORDINATOR",
  "WITNESS",
]);

function errorMessage(error: unknown) {
  return error instanceof ApiError || error instanceof Error
    ? error.message
    : "No fue posible completar la operación.";
}

function candidateLabel(candidate: ElectronicSignatureCandidate) {
  if (candidate.resource.kind === "FinancialEntry") {
    return `${candidate.resource.type} · ${candidate.resource.label}`;
  }
  return `E-14 ${candidate.resource.captureContext} · ${candidate.resource.pollingPlace.code} ${candidate.resource.pollingPlace.name} · mesa ${candidate.resource.mesa}`;
}

function formatDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Fecha no disponible"
    : new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "Tamaño no disponible";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function IntegritySignaturesPage() {
  const { tenant, user } = useAuth();
  const [selectedModule, setModule] =
    useState<ElectronicSignatureModule>("finance");
  const [selectedDocumentId, setSelectedDocumentId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [signing, setSigning] = useState(false);
  const [candidateMutationError, setCandidateError] = useState<string | null>(
    null,
  );
  const [signNotice, setSignNotice] = useState<string | null>(null);
  const [verificationInput, setVerificationInput] = useState({
    id: "",
    resourceId: "",
    module: "finance" as ElectronicSignatureModule,
  });
  const [verification, setVerification] =
    useState<ElectronicSignatureVerification | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(
    null,
  );
  const [verifying, setVerifying] = useState(false);

  const isClosed = tenant?.operationStage === "CLOSED";
  const canSignFinance = Boolean(
    user && FINANCE_SIGN_ROLES.has(user.backendRole),
  );
  const canSignE14 = Boolean(
    user &&
    tenant?.type === "CANDIDACY" &&
    E14_SIGN_ROLES.has(user.backendRole),
  );
  const availableModules = useMemo(() => {
    const values: ElectronicSignatureModule[] = [];
    if (canSignFinance) values.push("finance");
    if (canSignE14) values.push("e14");
    return values;
  }, [canSignE14, canSignFinance]);

  const documentModule = availableModules.includes(selectedModule)
    ? selectedModule
    : (availableModules[0] ?? "finance");
  const canSignSelectedModule =
    !isClosed && (documentModule === "finance" ? canSignFinance : canSignE14);
  const request = useCallback(
    (signal: AbortSignal) => listSigningCandidates(documentModule, signal),
    [documentModule],
  );
  const {
    data: candidateResult,
    loading,
    error: requestError,
    refresh: loadCandidates,
  } = usePageRequest(request, { enabled: canSignSelectedModule });
  const candidates = candidateResult?.items ?? [];
  const candidateError =
    candidateMutationError ??
    (requestError
      ? errorMessage(requestError)
      : candidateResult?.truncated
        ? `El listado incluye los ${candidateResult.limit} documentos más recientes, también los ya sellados. Los documentos anteriores no se pueden seleccionar desde esta pantalla.`
        : null);

  const selectedCandidate = candidates.find(
    ({ documentId }) => documentId === selectedDocumentId,
  );

  async function handleSign(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCandidate || selectedCandidate.signature || !/^\d{6}$/.test(otpCode)) {
      setCandidateError(
        "Selecciona un documento y escribe el código vigente de seis dígitos de tu MFA.",
      );
      return;
    }
    setSigning(true);
    setCandidateError(null);
    setSignNotice(null);
    try {
      const result = await signElectronicDocument({
        documentId: selectedCandidate.documentId,
        resourceId: selectedCandidate.resourceId,
        module: documentModule,
        otpCode,
      });
      setOtpCode("");
      setSelectedDocumentId("");
      setSignNotice(
        `Sello ${result.id} registrado a las ${formatDate(result.signedAt)}. Conserva el identificador para comprobar el vínculo y los metadatos.`,
      );
      setVerificationInput({
        id: result.id,
        resourceId: selectedCandidate.resourceId,
        module: documentModule,
      });
      await loadCandidates();
    } catch (error: unknown) {
      setCandidateError(errorMessage(error));
    } finally {
      setSigning(false);
    }
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (!verificationInput.id.trim() || !verificationInput.resourceId.trim()) {
      setVerificationError(
        "Escribe el identificador de firma y el recurso exacto que debe proteger.",
      );
      return;
    }
    setVerifying(true);
    setVerification(null);
    setVerificationError(null);
    try {
      setVerification(
        await verifyElectronicSignature({
          id: verificationInput.id.trim(),
          module: verificationInput.module,
          resourceId: verificationInput.resourceId.trim(),
        }),
      );
    } catch (error: unknown) {
      setVerificationError(errorMessage(error));
    } finally {
      setVerifying(false);
    }
  }

  return (
    <main
      id="dashboard-content"
      tabIndex={-1}
      className="space-y-8 outline-none min-w-0"
    >
      <PageHeader
        title="Sellos de documentos"
        eyebrow="Integridad documental"
        icon={ShieldCheck}
        description="Confirma el vínculo entre un archivo que cargaste y su registro financiero o acta E-14. Necesitas un documento elegible y el código de tu aplicación de autenticación."
      />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
        Este sello no es una firma de apoyo ciudadano ni sustituye un reporte,
        radicación o firma exigidos por la autoridad electoral.
        <details className="mt-2">
          <summary className="cursor-pointer py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">
            Qué comprueba el sistema
          </summary>
          <p className="mt-1">
            Antes de vincular la evidencia, un proceso independiente comprueba
            su contenido mediante SHA-256. La consulta del sello comprueba el
            vínculo y los metadatos guardados; no acredita por sí sola la
            autenticidad ni la validez jurídica del documento.
          </p>
        </details>
      </div>

      {isClosed && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 min-w-0">
          La operación está cerrada: los sellos existentes se pueden consultar,
          pero no se crean sellos nuevos.
        </div>
      )}

      {availableModules.length > 0 && !isClosed && (
        <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 min-w-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between min-w-0">
            <div>
              <h2 className="text-xl font-semibold text-slate-950">
                Crear un sello
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Elige un documento de la lista y confirma con tu código de
                autenticación. Solo aparecen archivos verificados y vinculados
                a un registro propio.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={loading || signing}
              onClick={() => void loadCandidates()}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              Actualizar
            </Button>
          </div>

          <p className="text-sm leading-6 text-slate-600">
            Si aún no tienes la autenticación de doble factor (MFA) activa,
            consulta su disponibilidad y configuración en{" "}
            <Link href="/dashboard/profile" className="font-semibold text-blue-700 underline underline-offset-4">
              Mi perfil
            </Link>. La creación del sello sigue sujeta a tu plan, rol y estado
            de la operación.
          </p>

          {availableModules.length > 1 && (
            <div
              className="flex gap-2 min-w-0 flex-wrap"
              role="group"
              aria-label="Tipo de documento"
            >
              {availableModules.map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={documentModule === value ? "default" : "outline"}
                  aria-pressed={documentModule === value}
                  onClick={() => {
                    setModule(value);
                    setSelectedDocumentId("");
                    setOtpCode("");
                    setSignNotice(null);
                  }}
                >
                  {value === "finance" ? "Finanzas" : "Actas E-14"}
                </Button>
              ))}
            </div>
          )}

          {candidateError && (
            <p
              role="alert"
              className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900"
            >
              {candidateError}
            </p>
          )}
          {signNotice && (
            <p
              role="status"
              className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-900"
            >
              {signNotice}
            </p>
          )}

          {loading ? (
            <div
              className="flex items-center gap-3 py-8 text-sm text-slate-500 min-w-0"
              role="status"
            >
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Consultando documentos disponibles…
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-600 min-w-0">
              No hay documentos propios pendientes o firmados en este módulo.
              Primero carga y vincula la evidencia desde Finanzas o el módulo
              de actas E-14, según tu rol. Después vuelve y pulsa Actualizar.
            </div>
          ) : (
            <form onSubmit={handleSign} className="space-y-5 min-w-0">
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-slate-800">
                  Selecciona un documento
                </legend>
                {candidates.map((candidate) => (
                  <label
                    key={candidate.documentId}
                    className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 transition hover:border-blue-300 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 min-w-0"
                  >
                    <input
                      type="radio"
                      name="signatureCandidate"
                      value={candidate.documentId}
                      checked={selectedDocumentId === candidate.documentId}
                      onChange={() =>
                        setSelectedDocumentId(candidate.documentId)
                      }
                      disabled={Boolean(candidate.signature)}
                      className="mt-1 h-4 w-4 min-w-0 max-w-full"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-slate-950">
                        {candidateLabel(candidate)}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {candidate.contentType} ·{" "}
                        {formatBytes(candidate.actualSize)} · vinculado{" "}
                        {formatDate(candidate.consumedAt)}
                      </span>
                      {candidate.signature && (
                        <span className="mt-2 block break-all text-xs leading-6 text-emerald-800">
                          Identificador del sello: <span className="font-mono">{candidate.signature.id}</span>
                          <span className="block">Identificador del registro: <span className="font-mono">{candidate.resourceId}</span></span>
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end min-w-0">
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="signatureOtp">
                    Código de tu aplicación de autenticación
                  </Label>
                  <Input
                    id="signatureOtp"
                    value={otpCode}
                    onChange={(event) =>
                      setOtpCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  disabled={
                    signing || !selectedCandidate || Boolean(selectedCandidate.signature) || otpCode.length !== 6
                  }
                >
                  {signing ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <FileSignature className="h-4 w-4" aria-hidden="true" />
                  )}
                  Crear sello
                </Button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="space-y-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 min-w-0">
        <div>
          <h2 className="text-xl font-semibold text-slate-950">
            Comprobar un sello
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Al crear un sello aquí, estos campos se completan automáticamente.
            Para consultar uno anterior, copia el identificador del sello y el
            del registro asociado: ambos aparecen junto a los documentos ya
            sellados de la lista, cuando tienes acceso. Esta consulta no dispone
            de un buscador de documentos.
          </p>
        </div>

        <form
          onSubmit={handleVerify}
          className="grid gap-4 lg:grid-cols-4 lg:items-end min-w-0"
        >
          <div className="space-y-2 min-w-0">
            <Label htmlFor="verifyModule">Módulo</Label>
            <select
              id="verifyModule"
              value={verificationInput.module}
              onChange={(event) =>
                setVerificationInput((current) => ({
                  ...current,
                  module: event.target.value as ElectronicSignatureModule,
                }))
              }
              className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm min-w-0 max-w-full"
            >
              <option value="finance">Finanzas</option>
              {tenant?.type === "CANDIDACY" && (
                <option value="e14">E-14</option>
              )}
            </select>
          </div>
          <div className="space-y-2 min-w-0">
            <Label htmlFor="verifySignatureId">Identificador del sello</Label>
            <Input
              id="verifySignatureId"
              value={verificationInput.id}
              onChange={(event) =>
                setVerificationInput((current) => ({
                  ...current,
                  id: event.target.value,
                }))
              }
              maxLength={128}
              required
            />
          </div>
          <div className="space-y-2 min-w-0">
            <Label htmlFor="verifyResourceId">Identificador del registro asociado</Label>
            <Input
              id="verifyResourceId"
              value={verificationInput.resourceId}
              onChange={(event) =>
                setVerificationInput((current) => ({
                  ...current,
                  resourceId: event.target.value,
                }))
              }
              maxLength={128}
              required
            />
          </div>
          <Button type="submit" disabled={verifying}>
            {verifying && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            )}
            Comprobar vínculo
          </Button>
        </form>

        {verificationError && (
          <p
            role="alert"
            className="rounded-2xl bg-red-50 p-4 text-sm text-red-800"
          >
            {verificationError}
          </p>
        )}
        {verification && (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-2xl p-5 ${
              verification.valid
                ? "bg-emerald-50 text-emerald-950"
                : "bg-red-50 text-red-950"
            }`}
          >
            {verification.valid ? (
              <CheckCircle2
                className="mt-0.5 h-6 w-6 shrink-0"
                aria-hidden="true"
              />
            ) : (
              <XCircle className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
            )}
            <div>
              <p className="font-semibold">
                {verification.valid
                  ? "Vínculo y metadatos coinciden"
                  : "El vínculo o los metadatos no coinciden"}
              </p>
              <p className="mt-1 text-sm">
                {verification.id} · {formatDate(verification.signedAt)}
              </p>
              <p className="mt-2 text-xs font-semibold">
                {verification.contentIntegrity === "VERIFIED"
                  ? "Integridad de contenido: verificada independientemente antes del consumo del archivo."
                  : "El servidor no confirmó la verificación independiente del contenido del archivo."}
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
