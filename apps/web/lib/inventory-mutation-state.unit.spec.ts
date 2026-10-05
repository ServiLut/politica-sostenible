import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, test } from "@playwright/test";
import { ApiError } from "./api-client";
import { receiveInventoryStock } from "./inventory-logistics-api";
import { createInventoryMutationState } from "./inventory-mutation-state";

const id = "11111111-1111-4111-8111-111111111111";
const payload = {
  clientRequestId: id,
  occurredAt: "2026-10-05T23:30:00.000Z",
  quantity: 3,
};
const receipt = (noOp = false) => ({
  command: {
    id: "receipt",
    clientRequestId: id,
    payloadSha256: "a".repeat(64),
    type: "STOCK_RECEIVE" as const,
    resourceType: "InventoryBalance",
    resourceId: "balance",
    createdAt: payload.occurredAt,
  },
  noOp,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
async function settled() {
  await Promise.resolve();
  await Promise.resolve();
}

test("a lost reply retains exact HTTP body/hash, UUID and date for a manual retry only", async () => {
  const originalFetch = globalThis.fetch;
  const bodies: string[] = [];
  globalThis.fetch = async (_url, options) => {
    bodies.push(String(options?.body));
    if (bodies.length === 1) throw new Error("Reply lost after server commit");
    const body = JSON.parse(String(options?.body));
    return new Response(
      JSON.stringify({
        data: {
          ...receipt(true),
          command: { ...receipt().command, payloadSha256: body.payloadSha256 },
        },
        statusCode: 201,
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const queue = createInventoryMutationState();
    const draft = {
      ...payload,
      warehouseId: "warehouse",
      itemId: "item",
      reason: "QA",
      custodyDeclaration: "QA",
    };
    let built = 0,
      confirmed = 0;
    queue.start(
      "stock",
      "Ingreso",
      () => {
        built++;
        return draft;
      },
      receiveInventoryStock,
      (result) => {
        confirmed++;
        expect(result.noOp).toBe(true);
      },
    );
    await expect.poll(() => queue.getSnapshot().phase).toBe("uncertain");
    draft.quantity = 99;
    draft.occurredAt = "2026-11-01T12:00:00.000Z";
    expect(
      queue.start(
        "new-stock",
        "Otro",
        () => {
          throw Error("Must not rebuild");
        },
        receiveInventoryStock,
        () => {},
      ),
    ).toBe(false);
    expect(bodies).toHaveLength(1);
    await queue.retry();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]!)).toMatchObject({ ...payload, quantity: 3 });
    expect(built).toBe(1);
    expect(confirmed).toBe(1);
    expect(queue.getSnapshot().phase).toBe("idle");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("same-tick submissions and retries cannot run concurrently", async () => {
  const queue = createInventoryMutationState();
  const response = deferred<ReturnType<typeof receipt>>();
  let sends = 0;
  expect(
    queue.start(
      "stock",
      "Ingreso",
      () => payload,
      () => {
        sends++;
        return response.promise;
      },
      () => {},
    ),
  ).toBe(true);
  expect(
    queue.start(
      "other",
      "Otro",
      () => payload,
      async () => receipt(),
      () => {},
    ),
  ).toBe(false);
  expect(await queue.retry()).toBe(false);
  expect(sends).toBe(1);
  response.resolve(receipt());
  await settled();
  expect(queue.getSnapshot().phase).toBe("idle");
});

test("a later authorization rejection cannot erase a previous ambiguous outcome", async () => {
  const queue = createInventoryMutationState();
  let attempts = 0;
  queue.start(
    "stock",
    "Ingreso",
    () => payload,
    async () => {
      throw new ApiError("unavailable", ++attempts === 1 ? 503 : 401);
    },
    () => {},
  );
  await settled();
  expect(queue.getSnapshot().phase).toBe("uncertain");
  await queue.retry();
  expect(queue.getSnapshot().phase).toBe("uncertain");
  expect(queue.getSnapshot().clientRequestId).toBe(id);
  expect(
    queue.start(
      "other",
      "Otro",
      () => payload,
      async () => receipt(),
      () => {},
    ),
  ).toBe(false);
});

for (const status of [408, 499]) {
  test(`a first ${status} timeout preserves the intent for an exact manual retry`, async () => {
    const queue = createInventoryMutationState();
    const sent: (typeof payload)[] = [];
    let prepares = 0;
    queue.start(
      "stock",
      "Ingreso",
      () => {
        prepares++;
        return payload;
      },
      async (input) => {
        sent.push(input);
        if (sent.length === 1)
          throw new ApiError("Timeout or client closed", status);
        return receipt();
      },
      () => {},
    );
    await settled();
    expect(queue.getSnapshot()).toMatchObject({
      phase: "uncertain",
      clientRequestId: id,
    });
    expect(
      queue.start(
        "other",
        "Otro",
        () => payload,
        async () => receipt(),
        () => {},
      ),
    ).toBe(false);
    expect(await queue.retry()).toBe(true);
    expect(prepares).toBe(1);
    expect(sent).toEqual([payload, payload]);
    expect(queue.getSnapshot().phase).toBe("idle");
  });
}

test("a definite first rejection releases the intent and keeps the visible error", async () => {
  const queue = createInventoryMutationState();
  queue.start(
    "stock",
    "Ingreso",
    () => payload,
    async () => {
      throw new ApiError("Falta lote", 400);
    },
    () => {},
  );
  await settled();
  expect(queue.getSnapshot()).toMatchObject({ phase: "idle", key: null });
  expect((queue.getSnapshot().error as Error).message).toBe("Falta lote");
  expect(await queue.retry()).toBe(false);
  expect(
    queue.start(
      "corrected",
      "Corregido",
      () => payload,
      async () => receipt(),
      () => {},
    ),
  ).toBe(true);
  await settled();
});

test("an unrelated receipt never confirms a pending operation", async () => {
  const queue = createInventoryMutationState();
  let confirmed = false;
  queue.start(
    "stock",
    "Ingreso",
    () => payload,
    async () => ({
      ...receipt(),
      command: { ...receipt().command, clientRequestId: "other" },
    }),
    () => {
      confirmed = true;
    },
  );
  await settled();
  expect(queue.getSnapshot().phase).toBe("uncertain");
  expect(confirmed).toBe(false);
});

test("payload mutation by the adapter cannot change the retained retry intent", async () => {
  const queue = createInventoryMutationState();
  const quantities: number[] = [];
  queue.start(
    "stock",
    "Ingreso",
    () => ({ ...payload }),
    async (input) => {
      quantities.push(input.quantity);
      input.quantity = 55;
      throw new ApiError("lost", 0);
    },
    () => {},
  );
  await settled();
  await queue.retry();
  expect(quantities).toEqual([3, 3]);
});

test("source validation errors do not send a command", () => {
  const queue = createInventoryMutationState();
  let sends = 0;
  expect(
    queue.start(
      "stock",
      "Ingreso",
      () => {
        throw Error("Cantidad inválida");
      },
      async () => {
        sends++;
        return receipt();
      },
      () => {},
    ),
  ).toBe(false);
  expect(sends).toBe(0);
  expect((queue.getSnapshot().error as Error).message).toBe(
    "Cantidad inválida",
  );
});

test("leaving a scope suppresses late UI changes and prevents retrying in the old scope", async () => {
  const queue = createInventoryMutationState("tenant-a/user-a"),
    response = deferred<ReturnType<typeof receipt>>();
  let changed = false;
  queue.start(
    "stock",
    "Ingreso",
    () => payload,
    () => response.promise,
    () => {
      changed = true;
    },
  );
  queue.deactivate();
  response.resolve(receipt());
  await settled();
  expect(changed).toBe(false);
  expect(await queue.retry()).toBe(false);
  expect(
    queue.start(
      "other",
      "Otro",
      () => payload,
      async () => receipt(),
      () => {},
    ),
  ).toBe(false);
});

test("a screen refresh failure cannot turn a confirmed receipt into an uncertain command", async () => {
  const queue = createInventoryMutationState();
  queue.start(
    "stock",
    "Ingreso",
    () => payload,
    async () => receipt(),
    () => {
      throw Error("render/readback failed");
    },
  );
  await settled();
  expect(queue.getSnapshot().phase).toBe("idle");
  expect((queue.getSnapshot().error as Error).message).toContain(
    "Movimiento confirmado",
  );
  expect(await queue.retry()).toBe(false);
});

for (const decision of [true, false]) {
  test(`the real reconciliation handler captures form data before asynchronous confirmation (${decision})`, async () => {
    const source = readFileSync(
      path.join(__dirname, "../app/dashboard/logistics/page.tsx"),
      "utf8",
    );
    const code = source.slice(
      source.indexOf("async function submitReconcile("),
      source.indexOf("function submitIncident("),
    );
    const js = ts.transpileModule(code, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const form = { value: "original" };
    const event = {
      currentTarget: form as typeof form | null,
      preventDefault() {},
    };
    const confirmation = deferred<boolean>();
    const commands: unknown[] = [];
    class Snapshot {
      value: string;
      constructor(target: typeof form) {
        if (!target) throw Error("Missing form");
        this.value = target.value;
      }
    }
    const handler = new Function(
      "confirm",
      "FormData",
      "runMutation",
      "reconcileInventoryTransfer",
      "freshCommandId",
      "requiredText",
      "integerField",
      `${js}; return submitReconcile;`,
    )(
      () => {
        event.currentTarget = null;
        return confirmation.promise;
      },
      Snapshot,
      (_key: unknown, _label: unknown, prepare: () => unknown) =>
        commands.push(prepare()),
      () => {},
      () => id,
      (data: Snapshot) => data.value,
      () => 0,
    );
    const pending = handler(event, {
      id: "transfer",
      code: "QA",
      updatedAt: payload.occurredAt,
      lines: [],
    });
    form.value = "changed during confirmation";
    confirmation.resolve(decision);
    await pending;
    expect(commands).toHaveLength(decision ? 1 : 0);
    if (decision)
      expect(commands[0]).toMatchObject({ reconciliationNote: "original" });
  });
}
