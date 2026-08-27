/**
 * Cliente pasivo para las capacidades de inteligencia política expuestas por
 * NestJS. Este paquete no conoce Prisma, credenciales de base de datos ni IDs de
 * tenant: el API debe resolver el tenant exclusivamente desde el JWT de servicio.
 */

export type PoliticalOperationMode = "CAMPAIGN" | "PUBLIC_OFFICE";

export interface RegionalPerformance {
  mode: PoliticalOperationMode;
  regionCode: string | null;
  voterCount: number;
  validatedSignatureCount: number;
  activeLeaderCount: number;
}

export interface CneCompliance {
  mode: PoliticalOperationMode;
  totalExpenses: string;
  budgetLimit: string | null;
  utilizationPercentage: number | null;
  withinLimit: boolean;
  warnings: string[];
}

export interface DayDAnomaly {
  reportId: string;
  pollingPlaceCode: string;
  tableNumber: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason: string;
}

export interface FinanceEntryAudit {
  entryId: string;
  compliant: boolean;
  findings: string[];
  requiresHumanReview: boolean;
}

export interface CounterNarrative {
  narrative: string;
  recommendations: string[];
  requiresHumanApproval: true;
}

export interface VolunteerRankingEntry {
  userId: string;
  displayName: string;
  points: number;
}

export interface InventoryMatch {
  itemId: string;
  name: string;
  sku: string | null;
  quantity: number;
  warehouse: string | null;
}

export interface NestPoliticalApiClientOptions {
  /** URL pública o interna del API NestJS; puede incluir un prefijo como `/api`. */
  baseUrl: string;
  /**
   * JWT emitido por NestJS para una identidad de servicio con tenant y scopes.
   * Nunca use aquí una service-role key de Supabase.
   */
  serviceToken: string;
  timeoutMs?: number;
  /** Inyección opcional para pruebas; en Node 18+ se usa `globalThis.fetch`. */
  fetchImplementation?: typeof globalThis.fetch;
}

export class NestPoliticalApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    message: string,
    options: { status: number; code: string; details?: unknown; cause?: unknown },
  ) {
    super(message, { cause: options.cause });
    this.name = "NestPoliticalApiError";
    this.status = options.status;
    this.code = options.code;
    this.details = options.details;
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_ERROR_BODY_LENGTH = 2_000;

/**
 * Adaptador HTTP sin estado. No inicia servidores, no ejecuta herramientas por
 * sí solo y no permite que el llamador suplante el tenant mediante parámetros.
 */
export class NestPoliticalApiClient {
  private readonly baseUrl: URL;
  private readonly serviceToken: string;
  private readonly timeoutMs: number;
  private readonly fetchImplementation: typeof globalThis.fetch;

  constructor(options: NestPoliticalApiClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.serviceToken = requireText(options.serviceToken, "serviceToken", 8_192);
    this.timeoutMs = normalizeTimeout(options.timeoutMs);

    const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    if (typeof fetchImplementation !== "function") {
      throw new TypeError(
        "No hay una implementación de fetch disponible; use Node 18+ o inyéctela explícitamente.",
      );
    }
    this.fetchImplementation = fetchImplementation;
  }

  getRegionalPerformance(regionCode?: string): Promise<RegionalPerformance> {
    const query = regionCode
      ? { regionCode: requireText(regionCode, "regionCode", 64) }
      : undefined;
    return this.request("GET", "internal/ai/regional-performance", undefined, query);
  }

  getCneCompliance(): Promise<CneCompliance> {
    return this.request("GET", "internal/ai/cne-compliance");
  }

  getDayDAnomalies(): Promise<DayDAnomaly[]> {
    return this.request("GET", "internal/ai/day-d/anomalies");
  }

  auditFinanceEntry(entryId: string): Promise<FinanceEntryAudit> {
    const safeEntryId = encodeURIComponent(
      requireText(entryId, "entryId", 128),
    );
    return this.request(
      "POST",
      `internal/ai/finance-entries/${safeEntryId}/audit`,
    );
  }

  generateCounterNarrative(input: {
    topic: string;
    sentiment?: string;
  }): Promise<CounterNarrative> {
    return this.request("POST", "internal/ai/counter-narratives", {
      topic: requireText(input.topic, "topic", 2_000),
      sentiment: optionalText(input.sentiment, "sentiment", 100),
    });
  }

  getTopVolunteers(limit = 10): Promise<VolunteerRankingEntry[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError("limit debe ser un entero entre 1 y 100.");
    }
    return this.request("GET", "internal/ai/volunteers/top", undefined, {
      limit: String(limit),
    });
  }

  searchInventory(itemName: string): Promise<InventoryMatch[]> {
    return this.request("GET", "internal/ai/inventory/search", undefined, {
      name: requireText(itemName, "itemName", 200),
    });
  }

  private async request<TResponse>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    query?: Readonly<Record<string, string>>,
  ): Promise<TResponse> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImplementation(url, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.serviceToken}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: "error",
        signal: abortController.signal,
      });

      const responseText = await response.text();
      const payload = parseJson(responseText);

      if (!response.ok) {
        throw new NestPoliticalApiError(
          extractApiMessage(payload, response.statusText),
          {
            status: response.status,
            code: extractApiCode(payload, "HTTP_ERROR"),
            details: sanitizeErrorDetails(payload, responseText),
          },
        );
      }

      if (response.status === 204 || responseText.length === 0) {
        return undefined as TResponse;
      }
      if (payload === undefined) {
        throw new NestPoliticalApiError(
          "El API devolvió una respuesta que no es JSON válido.",
          { status: response.status, code: "INVALID_JSON_RESPONSE" },
        );
      }

      return payload as TResponse;
    } catch (error: unknown) {
      if (error instanceof NestPoliticalApiError) {
        throw error;
      }
      if (abortController.signal.aborted) {
        throw new NestPoliticalApiError("La solicitud al API agotó el tiempo.", {
          status: 0,
          code: "REQUEST_TIMEOUT",
          cause: error,
        });
      }
      throw new NestPoliticalApiError("No fue posible conectar con el API NestJS.", {
        status: 0,
        code: "NETWORK_ERROR",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeBaseUrl(value: string): URL {
  const rawValue = requireText(value, "baseUrl", 2_048);
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch (error: unknown) {
    throw new TypeError("baseUrl debe ser una URL absoluta válida.", {
      cause: error,
    });
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("baseUrl debe usar el protocolo HTTP o HTTPS.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError(
      "baseUrl no puede incluir credenciales, parámetros de consulta ni fragmentos.",
    );
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
}

function normalizeTimeout(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
    throw new RangeError(`timeoutMs debe ser un entero entre 1 y ${MAX_TIMEOUT_MS}.`);
  }
  return value;
}

function requireText(value: string, field: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new TypeError(`${field} debe ser texto.`);
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new RangeError(
      `${field} debe contener entre 1 y ${maxLength} caracteres.`,
    );
  }
  return normalized;
}

function optionalText(
  value: string | undefined,
  field: string,
  maxLength: number,
): string | undefined {
  return value === undefined ? undefined : requireText(value, field, maxLength);
}

function parseJson(value: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function extractApiMessage(payload: unknown, fallback: string): string {
  if (isRecord(payload)) {
    if (typeof payload.message === "string") return payload.message;
    if (Array.isArray(payload.message)) {
      const messages = payload.message.filter(
        (item): item is string => typeof item === "string",
      );
      if (messages.length > 0) return messages.join("; ");
    }
  }
  return fallback || "El API rechazó la solicitud.";
}

function extractApiCode(payload: unknown, fallback: string): string {
  return isRecord(payload) && typeof payload.code === "string"
    ? payload.code
    : fallback;
}

function sanitizeErrorDetails(payload: unknown, rawBody: string): unknown {
  if (payload !== undefined) return payload;
  return rawBody.slice(0, MAX_ERROR_BODY_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
