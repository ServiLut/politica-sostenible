import { expect, test } from "@playwright/test";
import { listCommunicationApprovals } from "./communications-api";
import { listCommitments, listTasks } from "./work-api";

function successfulPage() {
  return new Response(
    JSON.stringify({
      statusCode: 200,
      message: "Success",
      data: {
        items: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
        permissions: { canCreate: false, canReadInternal: true },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

test("envía el identificador del deep-link sin aceptar tenant ni modo", async () => {
  const requestedUrls: URL[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    requestedUrls.push(new URL(String(input), "http://localhost"));
    return successfulPage();
  };

  try {
    await listTasks({ page: 1, limit: 1, entityId: "task-a" });
    await listCommitments({ page: 1, limit: 1, entityId: "commitment-a" });
    await listCommunicationApprovals({
      page: 1,
      limit: 1,
      entityId: "approval-a",
    });

    expect(
      requestedUrls.map((url) => ({
        pathname: url.pathname,
        entityId: url.searchParams.get("entityId"),
        hasTenant: url.searchParams.has("tenantId"),
        hasMode: url.searchParams.has("mode"),
      })),
    ).toEqual([
      {
        pathname: "/api/tasks",
        entityId: "task-a",
        hasTenant: false,
        hasMode: false,
      },
      {
        pathname: "/api/commitments",
        entityId: "commitment-a",
        hasTenant: false,
        hasMode: false,
      },
      {
        pathname: "/api/communications/approvals",
        entityId: "approval-a",
        hasTenant: false,
        hasMode: false,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
