"use client";

import { usePageRequest } from "@/lib/use-page-request";

import { Button, Input, Label } from "@/components/ui";
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
        ? `Se muestran los ${candidateResult.limit} documentos más recientes. Firma o archiva pendientes para consultar los anteriores.`
        : null);

  const selectedCandidate = candidates.find(
    ({ documentId }) => documentId === selectedDocumentId,
  );

  async function handleSign(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedCandidate || !/^\d{6}$/.test(otpCode)) {
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
      <header className="rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8 min-w-0">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between min-w-0">
          <div className="max-w-3xl space-y-3 min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 min-w-0">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Integridad documental
            </div>
            <h1 className="font-semibold tracking-tight text-2xl sm:text-3xl break-words">
              Sellos de vínculo y metadatos con MFA
            </h1>
            <p className="leading-7 text-slate-300">
              Confirma con MFA la evidencia financiera o E-14 que tú mismo
              cargaste y comprueba después su vínculo y metadatos de Storage.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm leading-6 text-amber-100 lg:max-w-md min-w-0">
            No es la recolección de apoyos ciudadanos ni sustituye un reporte,
            radicación o firma exigidos por la autoridad electoral. El servidor
            recalcula el SHA-256 de los bytes mediante un worker independiente
            antes de permitir que la evidencia sea consumida.
          </div>
        </div>
      </header>

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
                Mis documentos elegibles
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                La API solo devuelve archivos consumidos, confirmados y ligados
                a un registro de tu propiedad.
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
              Consultando candidatos autorizados…
            </div>
          ) : candidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm leading-6 text-slate-600 min-w-0">
              No hay documentos propios pendientes o firmados en este módulo.
              Primero carga y vincula la evidencia desde Finanzas o War Room.
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
                        <span className="mt-2 block font-mono text-xs text-emerald-800">
                          Sellado: {candidate.signature.id}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end min-w-0">
                <div className="space-y-2 min-w-0">
                  <Label htmlFor="signatureOtp">
                    Código MFA de seis dígitos
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
                    signing || !selectedCandidate || otpCode.length !== 6
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
                  Sellar vínculo
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
            La comprobación exige el identificador y el recurso exacto; un ID
            aislado no prueba el contenido de los bytes ni la autenticidad del
            documento.
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
            <Label htmlFor="verifySignatureId">ID del sello</Label>
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
            <Label htmlFor="verifyResourceId">ID del recurso</Label>
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
