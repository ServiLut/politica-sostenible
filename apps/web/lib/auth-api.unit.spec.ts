import { expect, test } from "@playwright/test";
import { updateOwnOrganization } from "./auth-api";

function successful(data: unknown) {
  return new Response(
    JSON.stringify({ statusCode: 200, message: "Success", data }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("actualiza la organizacion propia sin aceptar un tenant del cliente", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestInit = init;
    return successful({
      tenant: {
        id: "tenant-authenticated",
        name: "Movimiento Regi\u00f3n Viva",
        slug: "movimiento-region-viva",
        type: "CANDIDACY",
      },
      changed: true,
    });
  };

  try {
    await expect(
      updateOwnOrganization({
        name: "Movimiento Regi\u00f3n Viva",
        expectedName: "Organizaci\u00f3n anterior",
      }),
    ).resolves.toEqual({
      tenant: {
        id: "tenant-authenticated",
        name: "Movimiento Regi\u00f3n Viva",
        slug: "movimiento-region-viva",
        type: "CANDIDACY",
      },
      changed: true,
    });

    expect(requestedUrl).toBe("/api/auth/organization");
    expect(requestInit?.method).toBe("PATCH");
    expect(JSON.parse(String(requestInit?.body))).toEqual({
      name: "Movimiento Regi\u00f3n Viva",
      expectedName: "Organizaci\u00f3n anterior",
    });
    expect(JSON.parse(String(requestInit?.body))).not.toHaveProperty(
      "tenantId",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
