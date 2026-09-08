import { expect, test } from "@playwright/test";
import { apiRequest } from "./api-client";

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
