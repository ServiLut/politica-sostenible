import { expect, test } from "@playwright/test";
import { startDebouncedRequest } from "./debounced-request";

test("cancelar antes del debounce no inicia la consulta", async () => {
  let calls = 0;
  const cancel = startDebouncedRequest(
    async () => {
      calls += 1;
      return [];
    },
    () => {
      calls += 100;
    },
    () => {
      calls += 100;
    },
    0,
  );
  cancel();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(calls).toBe(0);
});

for (const completion of ["resolve", "reject"] as const) {
  test(`cancelar una consulta iniciada aborta la señal e ignora ${completion} tardío`, async () => {
    const started = Promise.withResolvers<AbortSignal>();
    const response = Promise.withResolvers<string[]>();
    const results: unknown[] = [];
    const cancel = startDebouncedRequest(
      (signal) => {
        started.resolve(signal);
        return response.promise;
      },
      (value) => results.push(value),
      (error) => results.push(error),
      0,
    );
    const signal = await started.promise;
    expect(signal.aborted).toBe(false);
    cancel();
    expect(signal.aborted).toBe(true);
    if (completion === "resolve") response.resolve(["respuesta obsoleta"]);
    else response.reject(new Error("fallo obsoleto"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(results).toEqual([]);
  });
}

test("solo entrega la búsqueda vigente cuando las respuestas llegan desordenadas", async () => {
  const firstStarted = Promise.withResolvers<void>();
  const firstResponse = Promise.withResolvers<string>();
  const newestDelivered = Promise.withResolvers<void>();
  const results: string[] = [];
  const cancelFirst = startDebouncedRequest(
    () => {
      firstStarted.resolve();
      return firstResponse.promise;
    },
    (result) => results.push(result),
    () => undefined,
    0,
  );
  await firstStarted.promise;
  cancelFirst();
  const cancelSecond = startDebouncedRequest(
    async () => "consulta actual",
    (result) => {
      results.push(result);
      newestDelivered.resolve();
    },
    () => undefined,
    0,
  );
  await newestDelivered.promise;
  firstResponse.resolve("consulta anterior");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(results).toEqual(["consulta actual"]);
  cancelSecond();
});

test("una falla vigente se entrega como error en vez de lista vacía", async () => {
  const delivered = Promise.withResolvers<unknown>();
  const failure = new Error("red no disponible");
  const cancel = startDebouncedRequest(
    async () => {
      throw failure;
    },
    () => delivered.reject(new Error("no debe marcar éxito")),
    delivered.resolve,
    0,
  );
  expect(await delivered.promise).toBe(failure);
  cancel();
});
