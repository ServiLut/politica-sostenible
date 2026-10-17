import { clearAuthSession, getStoredAccessToken } from "@/lib/auth-session";

interface ApiEnvelope<T> {
  data: T;
  message?: string;
  statusCode: number;
}

export interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
  auth?: boolean;
  headers?: HeadersInit;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiEnvelope<T>(value: unknown): value is ApiEnvelope<T> {
  return (
    isRecord(value) && "data" in value && typeof value.statusCode === "number"
  );
}

function extractMessage(value: unknown, depth = 0): string | null {
  if (depth > 3) return null;
  if (typeof value === "string" && value.trim()) return value.trim().slice(0, 1_000);

  if (Array.isArray(value)) {
    const messages = value.slice(0, 10)
      .map((item) => extractMessage(item, depth + 1))
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join(" ").slice(0, 1_000) : null;
  }

  if (!isRecord(value)) return null;

  return extractMessage(value.message, depth + 1) ?? extractMessage(value.error, depth + 1);
}

function publicApiError(payload: unknown, status: number): ApiError {
  // Only structured 4xx errors are part of the user-facing business contract.
  // Proxies and 5xx responses can contain stack traces, SQL or infrastructure
  // details. Never copy those bodies into UI messages or the error payload.
  const clientError = status >= 400 && status < 500 && isRecord(payload);
  const message = (clientError ? extractMessage(payload) : null) ??
    (status >= 500
      ? "El servidor no pudo completar la solicitud. Intenta nuevamente más tarde."
      : `No se pudo completar la solicitud (estado ${status}).`);
  const code = clientError && typeof payload.code === "string" &&
    /^[A-Z][A-Z0-9_]{1,79}$/.test(payload.code) ? payload.code : undefined;
  return new ApiError(message, status, {
    statusCode: status,
    message,
    ...(code ? { code } : {}),
  });
}

function getApiBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
  return (configuredUrl || "/api").replace(/\/+$/, "");
}

function getApiUrl(path: string) {
  return `${getApiBaseUrl()}/${path.replace(/^\/+/, "")}`;
}

async function readResponsePayload(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      if (!response.ok) return undefined;
      throw new ApiError("El servidor devolvió una respuesta no válida. Intenta nuevamente.", 502);
    }
  }

  if (!response.ok) return undefined;
  const text = await response.text();
  return text || undefined;
}

export async function apiRequest<T>(
  path: string,
  {
    auth = true,
    headers: initialHeaders,
    ...requestInit
  }: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers(initialHeaders);
  const accessToken = auth ? getStoredAccessToken() : null;

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (
    requestInit.body &&
    !(requestInit.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(getApiUrl(path), {
      ...requestInit,
      headers,
      cache: requestInit.cache ?? "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new ApiError(
      "No fue posible conectar con el servidor. Intenta nuevamente.",
      0,
    );
  }

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    if (
      response.status === 401 &&
      auth &&
      accessToken &&
      getStoredAccessToken() === accessToken
    ) {
      clearAuthSession();
    }

    throw publicApiError(payload, response.status);
  }

  return isApiEnvelope<T>(payload) ? payload.data : (payload as T);
}

export async function apiDownload(
  path: string,
  {
    auth = true,
    headers: initialHeaders,
    ...requestInit
  }: ApiRequestOptions = {},
): Promise<Blob> {
  const headers = new Headers(initialHeaders);
  const accessToken = auth ? getStoredAccessToken() : null;

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response: Response;
  try {
    response = await fetch(getApiUrl(path), {
      ...requestInit,
      headers,
      cache: requestInit.cache ?? "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError")
      throw cause;
    throw new ApiError(
      "No fue posible conectar con el servidor. Intenta nuevamente.",
      0,
    );
  }

  if (!response.ok) {
    const payload = await readResponsePayload(response);
    if (
      response.status === 401 &&
      auth &&
      accessToken &&
      getStoredAccessToken() === accessToken
    ) {
      clearAuthSession();
    }
    throw publicApiError(payload, response.status);
  }

  return response.blob();
}
