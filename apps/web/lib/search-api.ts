import { apiRequest } from "@/lib/api-client";
import {
  buildSearchResultHref,
  type SearchResourceCategory,
} from "@/lib/entity-deep-links";

export interface GlobalSearchResponse {
  voters: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string }>;
  proposals: Array<{ id: string; title: string; referenceCode: string }>;
  tasks?: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
  }>;
  commitments?: Array<{
    id: string;
    title: string;
    reference: string;
    status: string;
  }>;
  cases?: Array<{
    id: string;
    title: string;
    reference: string;
    status: string;
  }>;
  incidents?: Array<{
    id: string;
    title: string;
    reference: string;
    status: string;
  }>;
  pqrsd?: Array<{
    id: string;
    reference: string;
    subject: string;
    status: string;
    riskLevel: "NORMAL" | "HIGH";
    dueAt: string | null;
    responsible: { id: string; name: string } | null;
  }>;
}

export interface GlobalSearchResult {
  id: string;
  title: string;
  subtitle?: string;
  category: SearchResourceCategory;
  href: string;
}

const STATUS_LABELS: Record<string, string> = {
  TODO: "Por hacer",
  IN_PROGRESS: "En curso",
  BLOCKED: "Bloqueada",
  DONE: "Terminada",
  CANCELLED: "Cancelada",
  PROPOSED: "Propuesto",
  PLANNED: "Planificado",
  AT_RISK: "En riesgo",
  FULFILLED: "Cumplido",
  NOT_FULFILLED: "No cumplido",
  OPEN: "Abierto",
  TRIAGED: "Clasificado",
  WAITING_ON_CITIZEN: "Espera a la ciudadan\u00eda",
  WAITING_ON_EXTERNAL_ENTITY: "Espera a entidad externa",
  RESOLVED: "Resuelto",
  CLOSED: "Cerrado",
  RECEIVED: "Recibido",
  CLASSIFICATION_PENDING: "Clasificación pendiente",
  CLASSIFIED: "Clasificado",
  ASSIGNED: "Asignado",
  TRANSFER_PENDING: "Traslado pendiente",
  WAITING_ON_PETITIONER: "Espera a la persona peticionaria",
  EXTENSION_PROPOSED: "Prórroga propuesta",
  DRAFT_RESPONSE: "Respuesta en borrador",
  RETURNED_FOR_CHANGES: "Devuelto para correcciones",
  REVIEWED: "Respuesta revisada",
  AUTHORIZED: "Respuesta autorizada",
  DELIVERY_PENDING: "Entrega pendiente",
  DELIVERED: "Entregado",
  REOPENED: "Reabierto",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "Prioridad baja",
  MEDIUM: "Prioridad media",
  HIGH: "Prioridad alta",
  URGENT: "Urgente",
};

function statusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value.replaceAll("_", " ").toLowerCase();
}

function pqrsdDeadlineLabel(value: string | null): string {
  if (!value) return "Sin plazo calculado";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Plazo no disponible";
  const date = new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota",
  }).format(parsed);
  return `Vence ${date}`;
}

export function flattenGlobalSearch(
  response: GlobalSearchResponse,
): GlobalSearchResult[] {
  return [
    ...response.voters.map((voter) => ({
      id: voter.id,
      title: voter.name,
      subtitle: "Persona vinculada",
      category: "Voters" as const,
      href: buildSearchResultHref("Voters", voter.id),
    })),
    ...response.users.map((user) => ({
      id: user.id,
      title: user.name,
      subtitle: user.email,
      category: "Users" as const,
      href: buildSearchResultHref("Users", user.id),
    })),
    ...response.proposals.map((proposal) => ({
      id: proposal.id,
      title: proposal.title,
      subtitle: proposal.referenceCode,
      category: "Proposals" as const,
      href: buildSearchResultHref("Proposals", proposal.id),
    })),
    ...(response.tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      subtitle: `${PRIORITY_LABELS[task.priority] ?? task.priority} · ${statusLabel(task.status)}`,
      category: "Tasks" as const,
      href: buildSearchResultHref("Tasks", task.id),
    })),
    ...(response.commitments ?? []).map((commitment) => ({
      id: commitment.id,
      title: commitment.title,
      subtitle: `${commitment.reference} · ${statusLabel(commitment.status)}`,
      category: "Commitments" as const,
      href: buildSearchResultHref("Commitments", commitment.id),
    })),
    ...(response.cases ?? []).map((issueCase) => ({
      id: issueCase.id,
      title: issueCase.title,
      subtitle: `${issueCase.reference} · ${statusLabel(issueCase.status)}`,
      category: "Cases" as const,
      href: buildSearchResultHref("Cases", issueCase.id),
    })),
    ...(response.incidents ?? []).map((incident) => ({
      id: incident.id,
      title: incident.title,
      subtitle: `${incident.reference} · ${statusLabel(incident.status)}`,
      category: "Incidents" as const,
      href: buildSearchResultHref("Incidents", incident.id),
    })),
    ...(response.pqrsd ?? []).map((dossier) => ({
      id: dossier.id,
      title: dossier.subject,
      subtitle: [
        dossier.reference,
        statusLabel(dossier.status),
        dossier.riskLevel === "HIGH" ? "Riesgo alto" : "Riesgo normal",
        pqrsdDeadlineLabel(dossier.dueAt),
        dossier.responsible
          ? `Responsable: ${dossier.responsible.name}`
          : "Sin responsable",
      ].join(" · "),
      category: "Pqrsd" as const,
      href: buildSearchResultHref("Pqrsd", dossier.id),
    })),
  ];
}

export function searchGlobally(query: string, signal?: AbortSignal) {
  return apiRequest<GlobalSearchResponse>("search", {
    method: "POST",
    body: JSON.stringify({ query }),
    signal,
  });
}
