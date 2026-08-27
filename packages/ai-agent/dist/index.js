"use strict";
/**
 * Cliente pasivo para las capacidades de inteligencia política expuestas por
 * NestJS. Este paquete no conoce Prisma, credenciales de base de datos ni IDs de
 * tenant: el API debe resolver el tenant exclusivamente desde el JWT de servicio.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NestPoliticalApiClient = exports.NestPoliticalApiError = void 0;
class NestPoliticalApiError extends Error {
    status;
    code;
    details;
    constructor(message, options) {
        super(message, { cause: options.cause });
        this.name = "NestPoliticalApiError";
        this.status = options.status;
        this.code = options.code;
        this.details = options.details;
    }
}
exports.NestPoliticalApiError = NestPoliticalApiError;
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_ERROR_BODY_LENGTH = 2_000;
/**
 * Adaptador HTTP sin estado. No inicia servidores, no ejecuta herramientas por
 * sí solo y no permite que el llamador suplante el tenant mediante parámetros.
 */
class NestPoliticalApiClient {
    baseUrl;
    serviceToken;
    timeoutMs;
    fetchImplementation;
    constructor(options) {
        this.baseUrl = normalizeBaseUrl(options.baseUrl);
        this.serviceToken = requireText(options.serviceToken, "serviceToken", 8_192);
        this.timeoutMs = normalizeTimeout(options.timeoutMs);
        const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
        if (typeof fetchImplementation !== "function") {
            throw new TypeError("No hay una implementación de fetch disponible; use Node 18+ o inyéctela explícitamente.");
        }
        this.fetchImplementation = fetchImplementation;
    }
    getRegionalPerformance(regionCode) {
        const query = regionCode
            ? { regionCode: requireText(regionCode, "regionCode", 64) }
            : undefined;
        return this.request("GET", "internal/ai/regional-performance", undefined, query);
    }
    getCneCompliance() {
        return this.request("GET", "internal/ai/cne-compliance");
    }
    getDayDAnomalies() {
        return this.request("GET", "internal/ai/day-d/anomalies");
    }
    auditFinanceEntry(entryId) {
        const safeEntryId = encodeURIComponent(requireText(entryId, "entryId", 128));
        return this.request("POST", `internal/ai/finance-entries/${safeEntryId}/audit`);
    }
    generateCounterNarrative(input) {
        return this.request("POST", "internal/ai/counter-narratives", {
            topic: requireText(input.topic, "topic", 2_000),
            sentiment: optionalText(input.sentiment, "sentiment", 100),
        });
    }
    getTopVolunteers(limit = 10) {
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
            throw new RangeError("limit debe ser un entero entre 1 y 100.");
        }
        return this.request("GET", "internal/ai/volunteers/top", undefined, {
            limit: String(limit),
        });
    }
    searchInventory(itemName) {
        return this.request("GET", "internal/ai/inventory/search", undefined, {
            name: requireText(itemName, "itemName", 200),
        });
    }
    async request(method, path, body, query) {
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
                throw new NestPoliticalApiError(extractApiMessage(payload, response.statusText), {
                    status: response.status,
                    code: extractApiCode(payload, "HTTP_ERROR"),
                    details: sanitizeErrorDetails(payload, responseText),
                });
            }
            if (response.status === 204 || responseText.length === 0) {
                return undefined;
            }
            if (payload === undefined) {
                throw new NestPoliticalApiError("El API devolvió una respuesta que no es JSON válido.", { status: response.status, code: "INVALID_JSON_RESPONSE" });
            }
            return payload;
        }
        catch (error) {
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
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
exports.NestPoliticalApiClient = NestPoliticalApiClient;
function normalizeBaseUrl(value) {
    const rawValue = requireText(value, "baseUrl", 2_048);
    let url;
    try {
        url = new URL(rawValue);
    }
    catch (error) {
        throw new TypeError("baseUrl debe ser una URL absoluta válida.", {
            cause: error,
        });
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
        throw new TypeError("baseUrl debe usar el protocolo HTTP o HTTPS.");
    }
    if (url.username || url.password || url.search || url.hash) {
        throw new TypeError("baseUrl no puede incluir credenciales, parámetros de consulta ni fragmentos.");
    }
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
    return url;
}
function normalizeTimeout(value) {
    if (value === undefined)
        return DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(value) || value < 1 || value > MAX_TIMEOUT_MS) {
        throw new RangeError(`timeoutMs debe ser un entero entre 1 y ${MAX_TIMEOUT_MS}.`);
    }
    return value;
}
function requireText(value, field, maxLength) {
    if (typeof value !== "string") {
        throw new TypeError(`${field} debe ser texto.`);
    }
    const normalized = value.trim();
    if (normalized.length === 0 || normalized.length > maxLength) {
        throw new RangeError(`${field} debe contener entre 1 y ${maxLength} caracteres.`);
    }
    return normalized;
}
function optionalText(value, field, maxLength) {
    return value === undefined ? undefined : requireText(value, field, maxLength);
}
function parseJson(value) {
    if (!value)
        return undefined;
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
function extractApiMessage(payload, fallback) {
    if (isRecord(payload)) {
        if (typeof payload.message === "string")
            return payload.message;
        if (Array.isArray(payload.message)) {
            const messages = payload.message.filter((item) => typeof item === "string");
            if (messages.length > 0)
                return messages.join("; ");
        }
    }
    return fallback || "El API rechazó la solicitud.";
}
function extractApiCode(payload, fallback) {
    return isRecord(payload) && typeof payload.code === "string"
        ? payload.code
        : fallback;
}
function sanitizeErrorDetails(payload, rawBody) {
    if (payload !== undefined)
        return payload;
    return rawBody.slice(0, MAX_ERROR_BODY_LENGTH);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
