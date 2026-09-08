"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  Gauge,
  Loader2,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { Select } from "@/components/ui/select";
import { getRoleLabel } from "@/config/navigation";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  getOperationProfile,
  saveOperationProfile,
  type CandidateListType,
  type ElectoralCircumscriptionType,
  type ElectoralContestType,
  type OperationProfile,
  type OperationProfileContext,
  type PoliticalOperationType,
  type UpsertOperationProfileInput,
} from "@/lib/operation-profile-api";
import { listTeamMembers, type TeamMember } from "@/lib/team-api";
import type {
  BackendUserRole,
  PoliticalOperationStage,
  Tenant,
} from "@/types/saas-schema";

type Option<T extends string> = { value: T; label: string };

interface OperationProfileForm {
  operationType: PoliticalOperationType;
  stage: PoliticalOperationStage;
  electionType: ElectoralContestType;
  circumscriptionType: ElectoralCircumscriptionType;
  circumscriptionName: string;
  circumscriptionCode: string;
  listType: CandidateListType | "";
  electionDate: string;
  expectedTeamSize: string;
  candidateCount: string;
  maxTotalBudget: string;
  maxPublicityLimit: string;
  dataControllerName: string;
  responsibleDataUserId: string;
  retentionPeriodDays: string;
  revocationProcedure: string;
}

const OPERATION_TYPES: readonly Option<PoliticalOperationType>[] = [
  { value: "PRE_CANDIDACY", label: "Precampaña o aspiración" },
  { value: "SINGLE_CANDIDACY", label: "Candidatura uninominal" },
  {
    value: "CORPORATION_CANDIDACY",
    label: "Candidatura a corporación pública",
  },
  { value: "PARTY_MOVEMENT", label: "Partido o movimiento" },
  { value: "SIGNATURE_COMMITTEE", label: "Comité promotor de firmas" },
  { value: "TERRITORIAL_TEAM", label: "Equipo territorial" },
];

const STAGES: readonly Option<PoliticalOperationStage>[] = [
  { value: "EXPLORATION", label: "Exploración" },
  { value: "PRE_CAMPAIGN", label: "Precampaña" },
  { value: "SIGNATURE_COLLECTION", label: "Recolección de firmas" },
  { value: "CAMPAIGN", label: "Campaña" },
  { value: "ELECTION_PREPARATION", label: "Preparación electoral" },
  { value: "SIMULATION", label: "Simulación" },
  { value: "ELECTION_DAY", label: "Jornada electoral" },
  { value: "POST_ELECTION", label: "Poselectoral" },
  { value: "CLOSED", label: "Cerrada" },
];

const ELECTION_TYPES: readonly Option<ElectoralContestType>[] = [
  { value: "PRESIDENCY", label: "Presidencia" },
  { value: "GOVERNORSHIP", label: "Gobernación" },
  { value: "MAYORALTY", label: "Alcaldía" },
  { value: "SENATE", label: "Senado" },
  {
    value: "HOUSE_OF_REPRESENTATIVES",
    label: "Cámara de Representantes",
  },
  { value: "DEPARTMENTAL_ASSEMBLY", label: "Asamblea departamental" },
  { value: "MUNICIPAL_COUNCIL", label: "Concejo municipal" },
  {
    value: "LOCAL_ADMINISTRATIVE_BOARD",
    label: "Junta Administradora Local",
  },
  { value: "INTERNAL_ELECTION", label: "Elección interna" },
  { value: "OTHER", label: "Otra" },
];

const CIRCUMSCRIPTION_TYPES: readonly Option<ElectoralCircumscriptionType>[] = [
  { value: "NATIONAL", label: "Nacional" },
  { value: "DEPARTMENTAL", label: "Departamental" },
  { value: "MUNICIPAL", label: "Municipal" },
  { value: "LOCAL", label: "Local" },
  { value: "SPECIAL", label: "Especial" },
  { value: "INTERNAL", label: "Interna" },
];

const LIST_TYPES: readonly Option<CandidateListType>[] = [
  { value: "CLOSED", label: "Lista cerrada" },
  { value: "OPEN_PREFERENTIAL", label: "Lista abierta con voto preferente" },
];

const ELIGIBLE_DATA_ROLES = new Set<BackendUserRole>([
  "ADMIN",
  "CAMPAIGN_MANAGER",
  "COMPLIANCE_OFFICER",
]);

const SINGLE_CANDIDATE_OPERATIONS = new Set<PoliticalOperationType>([
  "PRE_CANDIDACY",
  "SINGLE_CANDIDACY",
  "SIGNATURE_COMMITTEE",
]);

const COLLEGIATE_ELECTIONS = new Set<ElectoralContestType>([
  "SENATE",
  "HOUSE_OF_REPRESENTATIVES",
  "DEPARTMENTAL_ASSEMBLY",
  "MUNICIPAL_COUNCIL",
  "LOCAL_ADMINISTRATIVE_BOARD",
]);

const MAX_CAMPAIGN_AMOUNT = 9_999_999_999_999.99;
const SELECT_CLASS =
  "border-slate-200 bg-white text-slate-900 focus-visible:border-blue-700";
const TEXTAREA_CLASS =
  "min-h-32 w-full resize-y rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-700 focus:ring-2 focus:ring-blue-700/10 disabled:cursor-not-allowed disabled:opacity-50";

const OPERATION_TYPE_LABELS = Object.fromEntries(
  OPERATION_TYPES.map(({ value, label }) => [value, label]),
) as Record<PoliticalOperationType, string>;
const STAGE_LABELS = Object.fromEntries(
  STAGES.map(({ value, label }) => [value, label]),
) as Record<PoliticalOperationStage, string>;
const ELECTION_TYPE_LABELS = Object.fromEntries(
  ELECTION_TYPES.map(({ value, label }) => [value, label]),
) as Record<ElectoralContestType, string>;
const CIRCUMSCRIPTION_TYPE_LABELS = Object.fromEntries(
  CIRCUMSCRIPTION_TYPES.map(({ value, label }) => [value, label]),
) as Record<ElectoralCircumscriptionType, string>;
const LIST_TYPE_LABELS = Object.fromEntries(
  LIST_TYPES.map(({ value, label }) => [value, label]),
) as Record<CandidateListType, string>;

function readableError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function defaultOperationType(
  tenantType?: Tenant["type"],
): PoliticalOperationType {
  if (tenantType === "PARTY") return "PARTY_MOVEMENT";
  if (tenantType === "GSC") return "SIGNATURE_COMMITTEE";
  return "SINGLE_CANDIDACY";
}

function dateInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Bogota",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function defaultForm(
  tenant: Tenant,
  userId: string,
  eligibleMembers: TeamMember[],
): OperationProfileForm {
  const responsible =
    eligibleMembers.find((member) => member.id === userId) ??
    eligibleMembers.at(0);
  const operationType = defaultOperationType(tenant.type);

  return {
    operationType,
    stage: tenant.operationStage ?? "EXPLORATION",
    electionType: "OTHER",
    circumscriptionType: "MUNICIPAL",
    circumscriptionName: "",
    circumscriptionCode: "",
    listType: operationType === "PARTY_MOVEMENT" ? "CLOSED" : "",
    electionDate: "",
    expectedTeamSize: "10",
    candidateCount: "1",
    maxTotalBudget: "",
    maxPublicityLimit: "",
    dataControllerName: tenant.name,
    responsibleDataUserId: responsible?.id ?? "",
    retentionPeriodDays: "730",
    revocationProcedure: "",
  };
}

function formFromProfile(
  profile: OperationProfile,
  eligibleMembers: TeamMember[],
): OperationProfileForm {
  const responsibleIsEligible = eligibleMembers.some(
    (member) => member.id === profile.responsibleDataUserId,
  );

  return {
    operationType: profile.operationType,
    stage: profile.stage,
    electionType: profile.electionType,
    circumscriptionType: profile.circumscriptionType,
    circumscriptionName: profile.circumscriptionName,
    circumscriptionCode: profile.circumscriptionCode ?? "",
    listType: profile.listType ?? "",
    electionDate: dateInputValue(profile.electionDate),
    expectedTeamSize: String(profile.expectedTeamSize),
    candidateCount: String(profile.candidateCount),
    maxTotalBudget: String(profile.budget.maxTotalBudget),
    maxPublicityLimit: String(profile.budget.maxPublicityLimit),
    dataControllerName: profile.dataControllerName,
    responsibleDataUserId: responsibleIsEligible
      ? profile.responsibleDataUserId
      : "",
    retentionPeriodDays: String(profile.retentionPeriodDays),
    revocationProcedure: profile.revocationProcedure,
  };
}

type NumericResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

function parseNumericField(
  rawValue: string,
  label: string,
  minimum: number,
  maximum: number,
  integer: boolean,
): NumericResult {
  const normalized = rawValue.trim().replace(",", ".");
  const value = Number(normalized);
  if (!normalized || !Number.isFinite(value)) {
    return { ok: false, message: `${label} debe ser un número válido.` };
  }
  if (integer && !Number.isInteger(value)) {
    return { ok: false, message: `${label} debe ser un número entero.` };
  }
  if (!integer && !/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, message: `${label} admite máximo dos decimales.` };
  }
  if (value < minimum || value > maximum) {
    return {
      ok: false,
      message: `${label} debe estar entre ${minimum} y ${maximum}.`,
    };
  }
  return { ok: true, value };
}

type InputResult =
  | { ok: true; input: UpsertOperationProfileInput }
  | { ok: false; message: string };

function buildInput(
  form: OperationProfileForm,
  eligibleMembers: TeamMember[],
  expectedUpdatedAt?: string,
): InputResult {
  const circumscriptionName = form.circumscriptionName.trim();
  const circumscriptionCode = form.circumscriptionCode.trim();
  const dataControllerName = form.dataControllerName.trim();
  const revocationProcedure = form.revocationProcedure.trim();

  if (!circumscriptionName || circumscriptionName.length > 160) {
    return {
      ok: false,
      message: "La circunscripción debe tener entre 1 y 160 caracteres.",
    };
  }
  if (
    circumscriptionCode &&
    (circumscriptionCode.length > 64 ||
      !/^[\p{L}\p{N}._/-]+$/u.test(circumscriptionCode))
  ) {
    return {
      ok: false,
      message:
        "El código de circunscripción solo admite letras, números, punto, guion, barra y guion bajo.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.electionDate)) {
    return { ok: false, message: "Selecciona una fecha electoral válida." };
  }
  const electionDate = new Date(`${form.electionDate}T12:00:00-05:00`);
  if (Number.isNaN(electionDate.getTime())) {
    return { ok: false, message: "Selecciona una fecha electoral válida." };
  }

  const expectedTeamSize = parseNumericField(
    form.expectedTeamSize,
    "El tamaño esperado del equipo",
    1,
    100_000,
    true,
  );
  if (!expectedTeamSize.ok) return expectedTeamSize;
  const candidateCount = parseNumericField(
    form.candidateCount,
    "La cantidad de candidaturas",
    1,
    10_000,
    true,
  );
  if (!candidateCount.ok) return candidateCount;
  const maxTotalBudget = parseNumericField(
    form.maxTotalBudget,
    "El presupuesto total",
    0.01,
    MAX_CAMPAIGN_AMOUNT,
    false,
  );
  if (!maxTotalBudget.ok) return maxTotalBudget;
  const maxPublicityLimit = parseNumericField(
    form.maxPublicityLimit,
    "El límite de publicidad",
    0.01,
    MAX_CAMPAIGN_AMOUNT,
    false,
  );
  if (!maxPublicityLimit.ok) return maxPublicityLimit;

  if (dataControllerName.length < 2 || dataControllerName.length > 200) {
    return {
      ok: false,
      message:
        "El responsable del tratamiento debe tener de 2 a 200 caracteres.",
    };
  }
  if (
    !eligibleMembers.some((member) => member.id === form.responsibleDataUserId)
  ) {
    return {
      ok: false,
      message: "Selecciona una persona activa y elegible como responsable.",
    };
  }
  const retentionPeriodDays = parseNumericField(
    form.retentionPeriodDays,
    "El periodo de conservación",
    1,
    3_650,
    true,
  );
  if (!retentionPeriodDays.ok) return retentionPeriodDays;
  if (revocationProcedure.length < 20 || revocationProcedure.length > 2_000) {
    return {
      ok: false,
      message:
        "El procedimiento de revocación debe tener entre 20 y 2.000 caracteres.",
    };
  }

  const supportsList =
    form.operationType === "CORPORATION_CANDIDACY" ||
    form.operationType === "PARTY_MOVEMENT";
  if (form.operationType === "CORPORATION_CANDIDACY" && !form.listType) {
    return {
      ok: false,
      message: "Selecciona el tipo de lista de la candidatura a corporación.",
    };
  }
  if (form.listType && !supportsList) {
    return {
      ok: false,
      message: "El tipo de lista solo aplica a corporaciones o partidos.",
    };
  }
  if (
    SINGLE_CANDIDATE_OPERATIONS.has(form.operationType) &&
    candidateCount.value !== 1
  ) {
    return {
      ok: false,
      message: "Esta operación debe registrar exactamente una candidatura.",
    };
  }
  const isCollegiateElection = COLLEGIATE_ELECTIONS.has(form.electionType);
  if (form.operationType === "CORPORATION_CANDIDACY" && !isCollegiateElection) {
    return {
      ok: false,
      message: "Una candidatura a corporación requiere una elección colegiada.",
    };
  }
  if (form.operationType === "SINGLE_CANDIDACY" && isCollegiateElection) {
    return {
      ok: false,
      message:
        "Una candidatura uninominal no puede usar una elección de corporación pública.",
    };
  }
  if (maxPublicityLimit.value > maxTotalBudget.value) {
    return {
      ok: false,
      message: "El límite de publicidad no puede superar el presupuesto total.",
    };
  }

  return {
    ok: true,
    input: {
      operationType: form.operationType,
      stage: form.stage,
      electionType: form.electionType,
      circumscriptionType: form.circumscriptionType,
      circumscriptionName,
      ...(circumscriptionCode ? { circumscriptionCode } : {}),
      ...(form.listType ? { listType: form.listType } : {}),
      electionDate: electionDate.toISOString(),
      expectedTeamSize: expectedTeamSize.value,
      candidateCount: candidateCount.value,
      maxTotalBudget: maxTotalBudget.value,
      maxPublicityLimit: maxPublicityLimit.value,
      dataControllerName,
      responsibleDataUserId: form.responsibleDataUserId,
      retentionPeriodDays: retentionPeriodDays.value,
      revocationProcedure,
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    },
  };
}

function formatElectionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "long",
    timeZone: "America/Bogota",
  }).format(date);
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  }).format(value);
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-semibold leading-6 text-slate-800">
        {value}
      </dd>
    </div>
  );
}

function OperationSummary({ context }: { context: OperationProfileContext }) {
  if (!context.configured) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-6 text-sm font-semibold leading-6 text-amber-950">
        Aún no existe un perfil operativo. La administración debe definirlo para
        que los módulos se adapten a la etapa y escala reales.
      </div>
    );
  }

  const { profile } = context;
  const capabilities = [
    profile.derived.dayDEnabled && "Operación electoral",
    profile.derived.warRoomEnabled && "Sala de crisis",
    profile.derived.signatureCollectionEnabled &&
      "Contexto de firmas (sin trámite oficial)",
    profile.derived.candidateListEnabled && "Gestión de listas",
    profile.derived.preferentialVoteEnabled && "Voto preferente",
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-6">
      <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
        <SummaryItem
          label="Tipo de operación"
          value={OPERATION_TYPE_LABELS[profile.operationType]}
        />
        <SummaryItem label="Etapa" value={STAGE_LABELS[profile.stage]} />
        <SummaryItem
          label="Elección y fecha"
          value={`${ELECTION_TYPE_LABELS[profile.electionType]} · ${formatElectionDate(profile.electionDate)}`}
        />
        <SummaryItem
          label="Circunscripción"
          value={`${CIRCUMSCRIPTION_TYPE_LABELS[profile.circumscriptionType]} · ${profile.circumscriptionName}${profile.circumscriptionCode ? ` (${profile.circumscriptionCode})` : ""}`}
        />
        <SummaryItem
          label="Lista"
          value={
            profile.listType ? LIST_TYPE_LABELS[profile.listType] : "No aplica"
          }
        />
        <SummaryItem
          label="Escala esperada"
          value={`${profile.expectedTeamSize.toLocaleString("es-CO")} integrantes · ${profile.candidateCount.toLocaleString("es-CO")} candidatura${profile.candidateCount === 1 ? "" : "s"}`}
        />
        <SummaryItem
          label="Presupuesto y publicidad"
          value={`${formatMoney(profile.budget.maxTotalBudget)} · límite ${formatMoney(profile.budget.maxPublicityLimit)}`}
        />
        <SummaryItem
          label="Responsable del tratamiento"
          value={`${profile.dataControllerName} · ${profile.responsibleDataUser.name} (${getRoleLabel(profile.responsibleDataUser.role)})`}
        />
        <SummaryItem
          label="Conservación"
          value={`${profile.retentionPeriodDays.toLocaleString("es-CO")} días`}
        />
        <SummaryItem
          label="Revocación y supresión"
          value={profile.revocationProcedure}
        />
      </dl>

      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
          Capacidades activas
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {capabilities.length > 0 ? (
            capabilities.map((capability) => (
              <span
                key={capability}
                className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-800"
              >
                {capability}
              </span>
            ))
          ) : (
            <span className="text-sm font-semibold text-slate-500">
              Operación cotidiana
            </span>
          )}
        </div>
      </div>
      {profile.derived.signatureCollectionEnabled && (
        <div
          role="note"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-950"
        >
          Este perfil identifica una operación de firmas, pero la plataforma no
          reemplaza los formularios, validaciones, radicación ni certificación
          de la Registraduría. La vinculación de contactos no equivale a un
          apoyo electoral válido.
        </div>
      )}
    </div>
  );
}

export default function OperationProfilePage() {
  const { synchronizeTenant, tenant, user } = useAuth();
  const canEdit = user?.backendRole === "ADMIN";
  const [context, setContext] = useState<OperationProfileContext | null>(null);
  const [eligibleMembers, setEligibleMembers] = useState<TeamMember[]>([]);
  const [form, setForm] = useState<OperationProfileForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!tenant || !user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setMembersError(null);
      const [profileResult, membersResult] = await Promise.allSettled([
        getOperationProfile(signal),
        canEdit ? listTeamMembers(signal) : Promise.resolve([]),
      ]);
      if (signal.aborted) return;

      let members: TeamMember[] = [];
      if (membersResult.status === "fulfilled") {
        members = membersResult.value
          .filter(
            (member) => member.isActive && ELIGIBLE_DATA_ROLES.has(member.role),
          )
          .sort((left, right) => left.name.localeCompare(right.name, "es"));
        setEligibleMembers(members);
      } else if (canEdit) {
        setEligibleMembers([]);
        setMembersError(
          readableError(
            membersResult.reason,
            "No fue posible consultar las personas responsables elegibles.",
          ),
        );
      }

      if (profileResult.status === "fulfilled") {
        setContext(profileResult.value);
        setForm(
          profileResult.value.configured
            ? formFromProfile(profileResult.value.profile, members)
            : defaultForm(tenant, user.id, members),
        );
      } else {
        setError(
          readableError(
            profileResult.reason,
            "No fue posible consultar el perfil de operación.",
          ),
        );
      }
      setLoading(false);
    },
    [canEdit, tenant, user],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, reload]);

  const supportsCandidateList =
    form?.operationType === "CORPORATION_CANDIDACY" ||
    form?.operationType === "PARTY_MOVEMENT";
  const forcesSingleCandidate = Boolean(
    form && SINGLE_CANDIDATE_OPERATIONS.has(form.operationType),
  );
  const canSave = Boolean(
    canEdit &&
    form &&
    !saving &&
    !loading &&
    !membersError &&
    eligibleMembers.length > 0,
  );
  const currentProfile = context?.configured ? context.profile : null;

  const responsibleHelp = useMemo(() => {
    if (membersError) return "Recarga para volver a consultar el equipo.";
    if (eligibleMembers.length === 0) {
      return "No hay integrantes activos con rol de administración, gerencia de campaña o cumplimiento.";
    }
    return "Solo se muestran integrantes activos autorizados por el servidor.";
  }, [eligibleMembers.length, membersError]);

  function setFormField<K extends keyof OperationProfileForm>(
    field: K,
    value: OperationProfileForm[K],
  ) {
    setForm((current) => (current ? { ...current, [field]: value } : current));
    setSaveError(null);
    setNotice(null);
  }

  function handleOperationTypeChange(value: PoliticalOperationType) {
    setForm((current) => {
      if (!current) return current;
      const supportsList =
        value === "CORPORATION_CANDIDACY" || value === "PARTY_MOVEMENT";
      return {
        ...current,
        operationType: value,
        candidateCount: SINGLE_CANDIDATE_OPERATIONS.has(value)
          ? "1"
          : current.candidateCount,
        listType: supportsList ? current.listType || "CLOSED" : "",
      };
    });
    setSaveError(null);
    setNotice(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || !form || !tenant) return;

    setSaveError(null);
    setNotice(null);
    const result = buildInput(form, eligibleMembers, currentProfile?.updatedAt);
    if (!result.ok) {
      setSaveError(result.message);
      return;
    }

    setSaving(true);
    try {
      const response = await saveOperationProfile(result.input);
      setContext(response);
      setForm(formFromProfile(response.profile, eligibleMembers));
      const synchronized = synchronizeTenant({
        ...tenant,
        operationStage: response.profile.stage,
      });
      setNotice("Perfil operativo guardado y navegación actualizada.");
      if (!synchronized) {
        setSaveError(
          "El perfil se guardó, pero la sesión local no pudo actualizarse. Vuelve a ingresar para ver el menú de la nueva etapa.",
        );
      }
    } catch (requestError: unknown) {
      setSaveError(
        readableError(
          requestError,
          "No fue posible guardar el perfil de operación.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-600/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-blue-800">
            <Settings2 aria-hidden="true" size={14} /> Configuración estratégica
          </span>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
            Perfil de operación
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Define el tipo de organización electoral, su etapa, alcance, escala,
            presupuesto y gobierno de datos. El sistema usa este perfil para
            habilitar el espacio de trabajo adecuado.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setReload((value) => value + 1)}
          disabled={loading || saving}
          className="w-full gap-2 sm:w-auto"
        >
          <RefreshCw
            aria-hidden="true"
            size={15}
            className={loading ? "animate-spin" : undefined}
          />
          Recargar perfil
        </Button>
      </header>

      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-semibold text-emerald-950"
        >
          <CheckCircle2 aria-hidden="true" size={20} className="shrink-0" />
          {notice}
        </div>
      )}

      {error && context && (
        <div
          role="alert"
          className="flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-3">
            <AlertCircle aria-hidden="true" size={20} className="shrink-0" />
            No se pudo actualizar el resumen. Conservamos la última versión:{" "}
            {error}
          </span>
          <button
            type="button"
            className="shrink-0 font-black text-amber-950 underline"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </button>
        </div>
      )}

      {loading && !context ? (
        <div
          role="status"
          className="flex items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white p-10 text-sm font-semibold text-slate-600 shadow-sm"
        >
          <Loader2 aria-hidden="true" className="animate-spin text-blue-700" />
          Consultando la configuración operativa…
        </div>
      ) : error && !context ? (
        <section className="rounded-3xl border border-red-200 bg-red-50 p-7 text-center shadow-sm">
          <AlertCircle
            aria-hidden="true"
            className="mx-auto text-red-700"
            size={34}
          />
          <h2 className="mt-4 text-xl font-black text-red-950">
            No pudimos abrir el perfil
          </h2>
          <p
            role="alert"
            className="mx-auto mt-2 max-w-xl text-sm text-red-900"
          >
            {error}
          </p>
          <Button
            type="button"
            className="mt-6"
            onClick={() => setReload((value) => value + 1)}
          >
            Reintentar
          </Button>
        </section>
      ) : context ? (
        <div
          className={
            canEdit
              ? "grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(290px,0.65fr)]"
              : "space-y-6"
          }
        >
          {canEdit && form ? (
            <form
              onSubmit={handleSubmit}
              className="space-y-8 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
            >
              <div>
                <h2 className="flex items-center gap-3 text-xl font-black text-slate-950">
                  <Gauge aria-hidden="true" className="text-blue-700" />
                  Parámetros de la operación
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Todos los cambios se validan en el servidor y quedan ligados
                  exclusivamente a esta organización.
                </p>
              </div>

              <fieldset className="space-y-5">
                <legend className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Estrategia electoral
                </legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="operation-type">Tipo de operación</Label>
                    <Select
                      id="operation-type"
                      className={SELECT_CLASS}
                      value={form.operationType}
                      onChange={(event) =>
                        handleOperationTypeChange(
                          event.target.value as PoliticalOperationType,
                        )
                      }
                    >
                      {OPERATION_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="operation-stage">Etapa operativa</Label>
                    <Select
                      id="operation-stage"
                      className={SELECT_CLASS}
                      value={form.stage}
                      onChange={(event) =>
                        setFormField(
                          "stage",
                          event.target.value as PoliticalOperationStage,
                        )
                      }
                    >
                      {STAGES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs leading-5 text-slate-500">
                      Cambiarla actualiza los módulos visibles en el menú.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="election-type">Tipo de elección</Label>
                    <Select
                      id="election-type"
                      className={SELECT_CLASS}
                      value={form.electionType}
                      onChange={(event) =>
                        setFormField(
                          "electionType",
                          event.target.value as ElectoralContestType,
                        )
                      }
                    >
                      {ELECTION_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="election-date">Fecha electoral</Label>
                    <Input
                      id="election-date"
                      type="date"
                      required
                      value={form.electionDate}
                      onChange={(event) =>
                        setFormField("electionDate", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="candidate-count">
                      Cantidad de candidaturas
                    </Label>
                    <Input
                      id="candidate-count"
                      type="number"
                      min={1}
                      max={10_000}
                      step={1}
                      required
                      disabled={forcesSingleCandidate}
                      value={form.candidateCount}
                      onChange={(event) =>
                        setFormField("candidateCount", event.target.value)
                      }
                    />
                    {forcesSingleCandidate && (
                      <p className="text-xs leading-5 text-slate-500">
                        Este tipo de operación admite una sola candidatura.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="list-type">Tipo de lista</Label>
                    <Select
                      id="list-type"
                      className={SELECT_CLASS}
                      disabled={!supportsCandidateList}
                      required={form.operationType === "CORPORATION_CANDIDACY"}
                      value={form.listType}
                      onChange={(event) =>
                        setFormField(
                          "listType",
                          event.target.value as CandidateListType | "",
                        )
                      }
                    >
                      <option value="">
                        {supportsCandidateList ? "Sin definir" : "No aplica"}
                      </option>
                      {LIST_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-5 border-t border-slate-100 pt-7">
                <legend className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Alcance y escala
                </legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="circumscription-type">
                      Tipo de circunscripción
                    </Label>
                    <Select
                      id="circumscription-type"
                      className={SELECT_CLASS}
                      value={form.circumscriptionType}
                      onChange={(event) =>
                        setFormField(
                          "circumscriptionType",
                          event.target.value as ElectoralCircumscriptionType,
                        )
                      }
                    >
                      {CIRCUMSCRIPTION_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="circumscription-name">
                      Nombre de la circunscripción
                    </Label>
                    <Input
                      id="circumscription-name"
                      maxLength={160}
                      required
                      placeholder="Ej. Municipio de Medellín"
                      value={form.circumscriptionName}
                      onChange={(event) =>
                        setFormField("circumscriptionName", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="circumscription-code">
                      Código de circunscripción (opcional)
                    </Label>
                    <Input
                      id="circumscription-code"
                      maxLength={64}
                      pattern="[A-Za-zÀ-ÖØ-öø-ÿ0-9._/\-]+"
                      placeholder="Ej. 05001"
                      value={form.circumscriptionCode}
                      onChange={(event) =>
                        setFormField("circumscriptionCode", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expected-team-size">
                      Tamaño esperado del equipo
                    </Label>
                    <Input
                      id="expected-team-size"
                      type="number"
                      min={1}
                      max={100_000}
                      step={1}
                      required
                      value={form.expectedTeamSize}
                      onChange={(event) =>
                        setFormField("expectedTeamSize", event.target.value)
                      }
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-5 border-t border-slate-100 pt-7">
                <legend className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Topes financieros
                </legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="max-total-budget">
                      Presupuesto total máximo (COP)
                    </Label>
                    <Input
                      id="max-total-budget"
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      max={MAX_CAMPAIGN_AMOUNT}
                      step={0.01}
                      required
                      value={form.maxTotalBudget}
                      onChange={(event) =>
                        setFormField("maxTotalBudget", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="max-publicity-limit">
                      Límite máximo de publicidad (COP)
                    </Label>
                    <Input
                      id="max-publicity-limit"
                      type="number"
                      inputMode="decimal"
                      min={0.01}
                      max={MAX_CAMPAIGN_AMOUNT}
                      step={0.01}
                      required
                      value={form.maxPublicityLimit}
                      onChange={(event) =>
                        setFormField("maxPublicityLimit", event.target.value)
                      }
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-5 border-t border-slate-100 pt-7">
                <legend className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
                  Gobierno de datos
                </legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="data-controller-name">
                      Responsable del tratamiento
                    </Label>
                    <Input
                      id="data-controller-name"
                      minLength={2}
                      maxLength={200}
                      required
                      value={form.dataControllerName}
                      onChange={(event) =>
                        setFormField("dataControllerName", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="responsible-data-user">
                      Persona responsable
                    </Label>
                    <Select
                      id="responsible-data-user"
                      aria-describedby="responsible-data-help"
                      className={SELECT_CLASS}
                      required
                      disabled={
                        Boolean(membersError) || eligibleMembers.length === 0
                      }
                      value={form.responsibleDataUserId}
                      onChange={(event) =>
                        setFormField(
                          "responsibleDataUserId",
                          event.target.value,
                        )
                      }
                    >
                      <option value="">Selecciona una persona</option>
                      {eligibleMembers.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} · {getRoleLabel(member.role)}
                        </option>
                      ))}
                    </Select>
                    <p
                      id="responsible-data-help"
                      className={`text-xs leading-5 ${membersError || eligibleMembers.length === 0 ? "font-semibold text-amber-800" : "text-slate-500"}`}
                    >
                      {responsibleHelp}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="retention-period-days">
                      Conservación de datos (días)
                    </Label>
                    <Input
                      id="retention-period-days"
                      type="number"
                      min={1}
                      max={3_650}
                      step={1}
                      required
                      value={form.retentionPeriodDays}
                      onChange={(event) =>
                        setFormField("retentionPeriodDays", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="revocation-procedure">
                      Procedimiento de revocación, supresión o corrección
                    </Label>
                    <textarea
                      id="revocation-procedure"
                      className={TEXTAREA_CLASS}
                      minLength={20}
                      maxLength={2_000}
                      required
                      value={form.revocationProcedure}
                      onChange={(event) =>
                        setFormField("revocationProcedure", event.target.value)
                      }
                    />
                    <p className="text-right text-xs font-semibold text-slate-400">
                      {form.revocationProcedure.length.toLocaleString("es-CO")}{" "}
                      / 2.000
                    </p>
                  </div>
                </div>
              </fieldset>

              {membersError && (
                <div
                  role="alert"
                  className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-950 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>{membersError}</span>
                  <button
                    type="button"
                    onClick={() => setReload((value) => value + 1)}
                    className="shrink-0 font-black underline"
                  >
                    Reintentar equipo
                  </button>
                </div>
              )}
              {saveError && (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900"
                >
                  <AlertCircle
                    aria-hidden="true"
                    size={19}
                    className="shrink-0"
                  />
                  {saveError}
                </div>
              )}

              <div className="flex flex-col gap-3 border-t border-slate-100 pt-7 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-md text-xs font-semibold leading-5 text-slate-500">
                  La versión abierta se envía al servidor para evitar que un
                  cambio simultáneo sobrescriba el trabajo de otra persona.
                </p>
                <Button
                  type="submit"
                  disabled={!canSave}
                  className="w-full gap-2 sm:w-auto"
                >
                  {saving ? (
                    <Loader2
                      aria-hidden="true"
                      size={17}
                      className="animate-spin"
                    />
                  ) : (
                    <Save aria-hidden="true" size={17} />
                  )}
                  {saving ? "Guardando…" : "Guardar perfil"}
                </Button>
              </div>
            </form>
          ) : (
            <section className="rounded-3xl border border-blue-100 bg-blue-50 p-6 sm:p-8">
              <ShieldCheck
                aria-hidden="true"
                className="text-blue-800"
                size={30}
              />
              <h2 className="mt-4 text-xl font-black text-blue-950">
                Consulta de configuración
              </h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-blue-950/75">
                Tu rol puede revisar el perfil vigente. Solo Administración
                puede modificar estos parámetros estratégicos.
              </p>
            </section>
          )}

          <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="mb-6 flex items-start gap-4 border-b border-slate-100 pb-5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                {context.configured ? (
                  <CheckCircle2 aria-hidden="true" size={22} />
                ) : (
                  <UsersRound aria-hidden="true" size={22} />
                )}
              </span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  Estado actual
                </p>
                <h2 className="mt-1 text-lg font-black text-slate-950">
                  {context.configured ? "Perfil configurado" : "Sin configurar"}
                </h2>
              </div>
            </div>
            <OperationSummary context={context} />
          </aside>
        </div>
      ) : null}
    </div>
  );
}
