import { expect, test } from "@playwright/test";
import { apiDownload, apiRequest } from "./api-client";

const storageKey = "politica-sostenible.auth-session";

function serializedSession(accessToken: string) {
  return JSON.stringify({
    accessToken,
    expiresAt: null,
    tenant: {
      id: "tenant-api-client",
      name: "Campaña verificable",
      slug: "campana-verificable",
      type: "CANDIDACY",
    },
    user: {
      backendRole: "ADMIN",
      email: "session@example.test",
      id: "user-api-client",
      name: "Dirección",
      role: "AdminCampana",
    },
  });
}

function createStorage(initialToken: string) {
  const values = new Map<string, string>([
    [storageKey, serializedSession(initialToken)],
  ]);

  return {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  } satisfies Storage;
}

function unauthorized() {
  return new Response(JSON.stringify({ message: "Sesión no autorizada" }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  });
}

function installWindow(sessionStorage: Storage) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      dispatchEvent: () => true,
      localStorage: createStorage("local-placeholder"),
      sessionStorage,
    },
  });

  return () => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  };
}

test("un 401 tardio de un JWT anterior no borra una sesion nueva", async () => {
  const originalFetch = globalThis.fetch;
  const storage = createStorage("old.header.signature");
  const restoreWindow = installWindow(storage);
  let resolveResponse!: (response: Response) => void;
  globalThis.fetch = () =>
    new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });

  try {
    const oldRequest = apiRequest("/protected-resource");
    storage.setItem(storageKey, serializedSession("new.header.signature"));
    resolveResponse(unauthorized());

    await expect(oldRequest).rejects.toMatchObject({ status: 401 });
    expect(JSON.parse(storage.getItem(storageKey)!).accessToken).toBe(
      "new.header.signature",
    );
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});

test("un 401 del JWT que sigue activo limpia la sesion local", async () => {
  const originalFetch = globalThis.fetch;
  const storage = createStorage("current.header.signature");
  const restoreWindow = installWindow(storage);
  globalThis.fetch = async () => unauthorized();

  try {
    await expect(apiRequest("/protected-resource")).rejects.toMatchObject({
      status: 401,
    });
    expect(storage.getItem(storageKey)).toBeNull();
  } finally {
    globalThis.fetch = originalFetch;
    restoreWindow();
  }
});

for (const [name, request] of [["JSON", apiRequest], ["descarga", apiDownload]] as const) {
  test(`${name}: los fallos 5xx no exponen diagnóstico interno en el mensaje ni en el payload`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({
      message: "TRACE_INTERNA_SINTETICA", stack: "RUTA_INTERNA_SINTETICA", debug: "DETALLE_RESERVADO_SINTETICO",
    }), { status: 500, headers: { "Content-Type": "application/json" } });
    try {
      const error = await request("test", { auth: false }).catch(value => value);
      expect(error).toMatchObject({
        status: 500,
        message: "El servidor no pudo completar la solicitud. Intenta nuevamente más tarde.",
      });
      expect(error.payload).toEqual({ statusCode: 500, message: "El servidor no pudo completar la solicitud. Intenta nuevamente más tarde." });
    } finally { globalThis.fetch = originalFetch; }
  });

  test(`${name}: no muestra cuerpos HTML o texto de proxies como errores de negocio`, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("<html>DIAGNOSTICO_PROXY_SINTETICO</html>", {
      status: 403, headers: { "Content-Type": "text/html" },
    });
    try {
      const error = await request("test", { auth: false }).catch(value => value);
      expect(error).toMatchObject({
        status: 403, message: "No se pudo completar la solicitud (estado 403).",
      });
      expect(error.payload).toEqual({ statusCode: 403, message: "No se pudo completar la solicitud (estado 403)." });
    } finally { globalThis.fetch = originalFetch; }
  });
}

test("conserva validaciones funcionales 4xx y código de perfil, pero descarta campos internos", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: ["Configura el perfil.", "Selecciona una etapa."],
    code: "OPERATION_STAGE_NOT_CONFIGURED", stack: "TRAZA_SINTETICA",
  }), { status: 409, headers: { "Content-Type": "application/json" } });
  try {
    await expect(apiRequest("test", { auth: false })).rejects.toMatchObject({
      status: 409, message: "Configura el perfil. Selecciona una etapa.",
      payload: { statusCode: 409, message: "Configura el perfil. Selecciona una etapa.", code: "OPERATION_STAGE_NOT_CONFIGURED" },
    });
    const error = await apiRequest("test", { auth: false }).catch(value => value);
    expect(error.payload).not.toHaveProperty("stack");
  } finally { globalThis.fetch = originalFetch; }
});

test("un JSON malformado no filtra fragmentos de respuesta y un 401 sigue cerrando la sesión", async () => {
  const originalFetch = globalThis.fetch;
  const storage = createStorage("current.header.signature");
  const restoreWindow = installWindow(storage);
  globalThis.fetch = async () => new Response('{"diagnostic":"FRAGMENTO_PRIVADO_SINTETICO"', {
    status: 401, headers: { "Content-Type": "application/json" },
  });
  try {
    await expect(apiRequest("test")).rejects.toMatchObject({ status: 401, message: "No se pudo completar la solicitud (estado 401)." });
    expect(storage.getItem(storageKey)).toBeNull();
    globalThis.fetch = async () => new Response('{"diagnostic":"FRAGMENTO_PRIVADO_SINTETICO"', {
      status: 200, headers: { "Content-Type": "application/json" },
    });
    await expect(apiRequest("test", { auth: false })).rejects.toMatchObject({ status: 502, message: "El servidor devolvió una respuesta no válida. Intenta nuevamente." });
  } finally { globalThis.fetch = originalFetch; restoreWindow(); }
});

test("limita la longitud de las validaciones y no propaga excepciones de red", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: "x".repeat(20_000) }), {
      status: 400, headers: { "Content-Type": "application/json" },
    });
    const error = await apiRequest("test", { auth: false }).catch(value => value);
    expect(error.message).toHaveLength(1_000);
    globalThis.fetch = async () => { throw new Error("RUTA_DE_RED_PRIVADA_SINTETICA"); };
    const networkError = await apiRequest("test", { auth: false }).catch(value => value);
    expect(networkError.message).toBe("No fue posible conectar con el servidor. Intenta nuevamente.");
    expect(networkError.payload).toBeUndefined();
  } finally { globalThis.fetch = originalFetch; }
});
