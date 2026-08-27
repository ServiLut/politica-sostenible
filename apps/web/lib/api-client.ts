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

function extractMessage(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => extractMessage(item))
      .filter((item): item is string => Boolean(item));
    return messages.length > 0 ? messages.join(" ") : null;
  }

  if (!isRecord(value)) return null;

  return extractMessage(value.message) ?? extractMessage(value.error);
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
    return response.json();
  }

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
      cause,
    );
  }

  const payload = await readResponsePayload(response);

  if (!response.ok) {
    if (response.status === 401 && auth && accessToken) {
      clearAuthSession();
    }

    throw new ApiError(
      extractMessage(payload) ??
        `La solicitud falló con estado ${response.status}.`,
      response.status,
      payload,
    );
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
      cause,
    );
  }

  if (!response.ok) {
    const payload = await readResponsePayload(response);
    if (response.status === 401 && auth && accessToken) {
      clearAuthSession();
    }
    throw new ApiError(
      extractMessage(payload) ??
        `La solicitud falló con estado ${response.status}.`,
      response.status,
      payload,
    );
  }

  return response.blob();
}
