"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Clipboard,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/context/auth";
import { ApiError } from "@/lib/api-client";
import {
  createTeamInvitation,
  CreatedTeamInvitation,
  listPendingTeamInvitations,
  listAssignableTeamDivisions,
  listTeamMembers,
  TeamDivision,
  TeamInvitation,
  TeamMember,
  updateTeamMemberRole,
  updateTeamMemberDivision,
  updateTeamMemberStatus,
} from "@/lib/team-api";
import { BackendUserRole } from "@/types/saas-schema";

const CAMPAIGN_ROLES: ReadonlyArray<{
  value: BackendUserRole;
  label: string;
}> = [
  { value: "CAMPAIGN_MANAGER", label: "Gerencia de campaña" },
  { value: "FINANCE_MANAGER", label: "Gerencia financiera" },
  { value: "COMMUNICATIONS_MANAGER", label: "Comunicaciones" },
  { value: "COMPLIANCE_OFFICER", label: "Cumplimiento" },
  { value: "AUDITOR", label: "Auditoría" },
  { value: "ZONE_COORDINATOR", label: "Coordinación zonal" },
  { value: "WITNESS", label: "Testigo electoral" },
  { value: "VOLUNTEER", label: "Voluntariado" },
];

const PUBLIC_OFFICE_ROLES: typeof CAMPAIGN_ROLES = [
  { value: "CONSTITUENT_SERVICES_MANAGER", label: "Dirección ciudadana" },
  { value: "CASE_WORKER", label: "Gestión de casos" },
  { value: "COMMUNICATIONS_MANAGER", label: "Comunicaciones" },
  { value: "COMPLIANCE_OFFICER", label: "Cumplimiento" },
  { value: "AUDITOR", label: "Auditoría" },
];

const ROLE_LABELS = new Map(
  [
    ...CAMPAIGN_ROLES,
    ...PUBLIC_OFFICE_ROLES,
    { value: "ADMIN", label: "Administración" },
  ].map((item) => [item.value, item.label]),
);

const TERRITORIAL_ROLES = new Set<BackendUserRole>([
  "ZONE_COORDINATOR",
  "WITNESS",
  "VOLUNTEER",
]);

function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return "Ocurrió un error inesperado. Intenta nuevamente.";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function TeamPage() {
  const { tenant, user } = useAuth();
  const roleOptions = useMemo(
    () =>
      tenant?.type === "PUBLIC_OFFICE" ? PUBLIC_OFFICE_ROLES : CAMPAIGN_ROLES,
    [tenant?.type],
  );
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<TeamInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<BackendUserRole>(roleOptions[0].value);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedTeamInvitation | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const [divisionMember, setDivisionMember] = useState<TeamMember | null>(null);
  const [divisionSearch, setDivisionSearch] = useState("");
  const [divisionOptions, setDivisionOptions] = useState<TeamDivision[]>([]);
  const [selectedDivisionId, setSelectedDivisionId] = useState("");
  const [loadingDivisions, setLoadingDivisions] = useState(false);

  useEffect(() => {
    if (!roleOptions.some((option) => option.value === role)) {
      setRole(roleOptions[0].value);
    }
  }, [role, roleOptions]);

  const loadTeam = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const [memberResult, invitationResult] = await Promise.all([
        listTeamMembers(signal),
        listPendingTeamInvitations(signal),
      ]);
      setMembers(memberResult.items);
      setInvitations(invitationResult.items);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setLoadError(readableError(error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadTeam(controller.signal);
    return () => controller.abort();
  }, [loadTeam, reloadVersion]);

  useEffect(() => {
    if (!divisionMember) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setLoadingDivisions(true);
      void listAssignableTeamDivisions(
        divisionMember.role,
        divisionSearch,
        controller.signal,
      )
        .then((options) => {
          const unique = new Map(options.map((option) => [option.id, option]));
          if (divisionMember.division) {
            unique.set(divisionMember.division.id, divisionMember.division);
          }
          setDivisionOptions([...unique.values()]);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
          setMutationError(readableError(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoadingDivisions(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [divisionMember, divisionSearch]);

  async function handleInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMutationError(null);
    setCreated(null);
    setCopyStatus("idle");
    try {
      const result = await createTeamInvitation({
        email: email.trim(),
        role,
      });
      setCreated(result);
      setEmail("");
      setReloadVersion((value) => value + 1);
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setSaving(false);
    }
  }

  async function copyInvitationLink() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.invitationUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  function replaceMember(
    updated: Pick<TeamMember, "id" | "role" | "isActive">,
  ) {
    setMembers((current) =>
      current.map((member) =>
        member.id === updated.id ? { ...member, ...updated } : member,
      ),
    );
  }

  async function handleMemberRole(
    member: TeamMember,
    nextRole: BackendUserRole,
  ) {
    if (nextRole === member.role) return;
    setUpdatingMemberId(member.id);
    setMutationError(null);
    try {
      replaceMember(await updateTeamMemberRole(member.id, nextRole));
      setReloadVersion((value) => value + 1);
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setUpdatingMemberId(null);
    }
  }

  function openDivisionAssignment(member: TeamMember) {
    setDivisionMember(member);
    setDivisionSearch("");
    setDivisionOptions(member.division ? [member.division] : []);
    setSelectedDivisionId(member.divisionId ?? "");
    setMutationError(null);
  }

  async function saveDivisionAssignment() {
    if (!divisionMember) return;
    setUpdatingMemberId(divisionMember.id);
    setMutationError(null);
    try {
      const updated = await updateTeamMemberDivision(
        divisionMember.id,
        selectedDivisionId || null,
      );
      setMembers((current) =>
        current.map((member) =>
          member.id === updated.id ? { ...member, ...updated } : member,
        ),
      );
      setDivisionMember(null);
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setUpdatingMemberId(null);
    }
  }

  async function handleMemberStatus(member: TeamMember) {
    setUpdatingMemberId(member.id);
    setMutationError(null);
    try {
      replaceMember(await updateTeamMemberStatus(member.id, !member.isActive));
    } catch (error: unknown) {
      setMutationError(readableError(error));
    } finally {
      setUpdatingMemberId(null);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-blue-700">
          <ShieldCheck size={16} aria-hidden="true" /> Administración de acceso
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">
          Equipo y accesos
        </h1>
        <p className="mt-2 max-w-3xl text-sm font-medium leading-6 text-slate-600">
          Invita a cada persona con el menor privilegio necesario. Los enlaces
          vencen en 72 horas, se usan una sola vez y nunca convierten a alguien
          en administrador.
        </p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[24rem_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-2xl bg-blue-50 p-3 text-blue-700">
              <UserPlus size={22} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Invitar persona
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                Entrega manual y controlada
              </p>
            </div>
          </div>

          <form onSubmit={handleInvite} className="space-y-4">
            <label className="block space-y-2 text-sm font-black text-slate-700">
              Correo electrónico
              <input
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="persona@organizacion.co"
                className="min-h-12 w-full rounded-xl border border-slate-200 px-4 font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>
            <label className="block space-y-2 text-sm font-black text-slate-700">
              Rol operativo
              <select
                aria-label="Rol operativo"
                value={role}
                onChange={(event) =>
                  setRole(event.target.value as BackendUserRole)
                }
                className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {mutationError && (
              <p
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800"
              >
                {mutationError}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-black text-white transition hover:bg-blue-800 disabled:opacity-50"
            >
              {saving ? (
                <Loader2
                  className="animate-spin"
                  size={18}
                  aria-hidden="true"
                />
              ) : (
                <UserPlus size={18} aria-hidden="true" />
              )}
              Crear invitación
            </button>
          </form>

          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-900">
            La plataforma no envía correos sin un proveedor configurado. Copia
            el enlace y compártelo por un canal verificado con la persona.
          </p>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-white shadow-sm">
          <h2 className="text-lg font-black">Enlace de un solo uso</h2>
          {!created ? (
            <div className="mt-5 flex min-h-44 items-center justify-center rounded-2xl border border-dashed border-slate-700 p-6 text-center text-sm font-semibold text-slate-400">
              El enlace aparecerá aquí una sola vez después de crear la
              invitación.
            </div>
          ) : (
            <div className="mt-5 space-y-4" role="status">
              <p className="text-sm font-semibold text-emerald-300">
                Invitación creada para {created.invitation.email}
              </p>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-400">
                Enlace secreto
                <textarea
                  aria-label="Enlace secreto de invitación"
                  readOnly
                  rows={4}
                  value={created.invitationUrl}
                  className="mt-2 w-full resize-none rounded-xl border border-slate-700 bg-slate-900 p-3 font-mono text-xs normal-case tracking-normal text-slate-100"
                  onFocus={(event) => event.currentTarget.select()}
                />
              </label>
              <button
                type="button"
                onClick={() => void copyInvitationLink()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-black text-slate-950"
              >
                {copyStatus === "copied" ? (
                  <Check size={17} aria-hidden="true" />
                ) : (
                  <Clipboard size={17} aria-hidden="true" />
                )}
                {copyStatus === "copied" ? "Enlace copiado" : "Copiar enlace"}
              </button>
              {copyStatus === "failed" && (
                <p role="alert" className="text-xs font-bold text-amber-300">
                  No se pudo acceder al portapapeles. Selecciona y copia el
                  enlace manualmente.
                </p>
              )}
              <p className="text-xs leading-5 text-slate-400">
                Por seguridad, este secreto no vuelve a aparecer en el listado.
                Si se pierde, crea una nueva invitación cuando esta venza.
              </p>
            </div>
          )}
        </div>
      </section>

      {loading ? (
        <div
          role="status"
          className="flex min-h-64 items-center justify-center gap-3 rounded-3xl border border-slate-200 bg-white text-sm font-bold text-slate-600"
        >
          <Loader2 className="animate-spin text-blue-700" aria-hidden="true" />
          Cargando equipo…
        </div>
      ) : loadError ? (
        <div
          role="alert"
          className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-3xl border border-red-200 bg-red-50 p-8 text-center text-red-800"
        >
          <AlertCircle size={30} aria-hidden="true" />
          <p className="font-bold">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadVersion((value) => value + 1)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-black text-white"
          >
            <RefreshCw size={16} aria-hidden="true" /> Reintentar
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {mutationError && (
            <p
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"
            >
              {mutationError}
            </p>
          )}
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <div className="flex items-center gap-3">
                  <Users
                    className="text-blue-700"
                    size={21}
                    aria-hidden="true"
                  />
                  <h2 className="text-lg font-black text-slate-950">
                    Miembros
                  </h2>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  {members.length}
                </span>
              </div>
              {members.length === 0 ? (
                <p className="p-6 text-sm font-semibold text-slate-500">
                  No hay miembros visibles.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {members.map((member) => (
                    <li key={member.id} className="p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-950">
                            {member.name}
                          </p>
                          <p className="mt-1 break-all text-sm font-semibold text-slate-500">
                            {member.email}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            member.isActive
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {member.isActive
                            ? "Cuenta activa"
                            : "Cuenta desactivada"}
                        </span>
                      </div>

                      {member.role === "ADMIN" || member.id === user?.id ? (
                        <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3">
                          <p className="text-sm font-black text-blue-900">
                            {ROLE_LABELS.get(member.role) ?? member.role}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-blue-700">
                            Cuenta administradora protegida: no admite cambios
                            de rol ni desactivacion desde este panel.
                          </p>
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                            <label className="space-y-1 text-xs font-black text-slate-700">
                              Rol de {member.name}
                              <select
                                aria-label={`Rol de ${member.name}`}
                                value={member.role}
                                disabled={updatingMemberId === member.id}
                                onChange={(event) =>
                                  void handleMemberRole(
                                    member,
                                    event.target.value as BackendUserRole,
                                  )
                                }
                                className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold disabled:opacity-60"
                              >
                                {roleOptions.map((option) => (
                                  <option
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="button"
                              disabled={updatingMemberId === member.id}
                              onClick={() => void handleMemberStatus(member)}
                              className={`min-h-11 rounded-xl px-4 text-sm font-black disabled:opacity-60 ${
                                member.isActive
                                  ? "border border-red-200 bg-red-50 text-red-800"
                                  : "bg-emerald-700 text-white"
                              }`}
                            >
                              {updatingMemberId === member.id
                                ? "Guardando..."
                                : member.isActive
                                  ? `Desactivar a ${member.name}`
                                  : `Reactivar a ${member.name}`}
                            </button>
                          </div>
                          {TERRITORIAL_ROLES.has(member.role) && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
                              <div className="flex items-center gap-3">
                                <MapPin
                                  size={18}
                                  className="text-blue-700"
                                  aria-hidden="true"
                                />
                                <div>
                                  <p className="text-xs font-black uppercase tracking-wider text-blue-800">
                                    Alcance territorial
                                  </p>
                                  <p className="mt-1 text-sm font-bold text-slate-800">
                                    {member.division
                                      ? `${member.division.name} · ${member.division.type}`
                                      : "Sin asignar — el acceso operativo está bloqueado"}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => openDivisionAssignment(member)}
                                className="min-h-10 rounded-xl bg-blue-700 px-4 text-xs font-black text-white"
                              >
                                {member.division ? "Reasignar" : "Asignar"}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <h2 className="text-lg font-black text-slate-950">
                  Invitaciones pendientes
                </h2>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-900">
                  {invitations.length}
                </span>
              </div>
              {invitations.length === 0 ? (
                <p className="p-6 text-sm font-semibold text-slate-500">
                  No hay invitaciones vigentes pendientes.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {invitations.map((invitation) => (
                    <li key={invitation.id} className="p-5">
                      <p className="break-all font-black text-slate-950">
                        {invitation.email}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {ROLE_LABELS.get(invitation.role) ?? invitation.role}
                      </p>
                      <p className="mt-3 text-xs font-bold text-amber-800">
                        Vence {formatDate(invitation.expiresAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}

      {divisionMember && (
        <div
          role="presentation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDivisionMember(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="division-dialog-title"
            className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                  Permiso territorial
                </p>
                <h2
                  id="division-dialog-title"
                  className="mt-2 text-2xl font-black text-slate-950"
                >
                  Asignar a {divisionMember.name}
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  La persona sólo podrá operar en esta división y sus
                  descendientes.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDivisionMember(null)}
                aria-label="Cerrar asignación territorial"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <label className="relative mt-6 block">
              <span className="sr-only">Buscar municipio, zona o puesto</span>
              <Search
                size={18}
                aria-hidden="true"
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                autoFocus
                maxLength={100}
                value={divisionSearch}
                onChange={(event) => setDivisionSearch(event.target.value)}
                placeholder="Buscar por nombre o código"
                className="min-h-12 w-full rounded-xl border border-slate-200 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <label className="mt-4 block text-sm font-black text-slate-700">
              División compatible con {ROLE_LABELS.get(divisionMember.role)}
              <select
                value={selectedDivisionId}
                onChange={(event) => setSelectedDivisionId(event.target.value)}
                disabled={loadingDivisions}
                className="mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold disabled:opacity-60"
              >
                <option value="">Sin asignación</option>
                {divisionOptions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.type} · {division.name} · {division.code}
                  </option>
                ))}
              </select>
            </label>
            {loadingDivisions && (
              <p
                role="status"
                className="mt-3 text-sm font-semibold text-blue-700"
              >
                Consultando territorio…
              </p>
            )}
            {!loadingDivisions && divisionOptions.length === 0 && (
              <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                No hay resultados compatibles. Crea la zona o puesto desde
                Organización territorial y vuelve a buscar.
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDivisionMember(null)}
                className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-black text-slate-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void saveDivisionAssignment()}
                disabled={updatingMemberId === divisionMember.id}
                className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-black text-white disabled:opacity-50"
              >
                {updatingMemberId === divisionMember.id
                  ? "Guardando…"
                  : "Guardar alcance"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
