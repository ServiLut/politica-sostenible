import { ApiError } from "./api-client";
import type { InventoryCommandResponse } from "./inventory-logistics-api";

export interface InventoryMutationSnapshot {
  phase: "idle" | "sending" | "uncertain";
  key: string | null;
  label: string | null;
  clientRequestId: string | null;
  error: unknown;
}

/** One in-memory intent. Retrying never reconstructs a command from edited fields. */
export function createInventoryMutationState(ownerKey = "isolated-test") {
  let viewing = true;
  const initial: InventoryMutationSnapshot = {
    phase: "idle",
    key: null,
    label: null,
    clientRequestId: null,
    error: null,
  };
  let snapshot = initial;
  let pending: {
    execute: () => Promise<InventoryCommandResponse<object>>;
    confirmed: (result: InventoryCommandResponse<object>) => void;
    uncertain: boolean;
  } | null = null;
  const listeners = new Set<() => void>();
  function publish(next: InventoryMutationSnapshot) {
    snapshot = next;
    for (const listener of listeners) listener();
  }
  async function run() {
    const intent = pending;
    if (!viewing || !intent || snapshot.phase === "sending") return false;
    publish({ ...snapshot, phase: "sending", error: null });
    let result: InventoryCommandResponse<object>;
    try {
      result = await intent.execute();
      if (
        result.command?.clientRequestId !== snapshot.clientRequestId ||
        typeof result.command.id !== "string" ||
        !result.command.id ||
        !/^[a-f0-9]{64}$/.test(result.command.payloadSha256) ||
        typeof result.noOp !== "boolean"
      ) {
        throw new Error(
          "El servidor no devolvió un recibo identificable de esta operación.",
        );
      }
    } catch (error) {
      // A later 401/409/429 cannot establish whether an earlier lost reply committed.
      const definiteRejection =
        !intent.uncertain &&
        error instanceof ApiError &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 408 &&
        error.status !== 499;
      if (definiteRejection) {
        pending = null;
        publish({ ...initial, error });
      } else {
        intent.uncertain = true;
        publish({ ...snapshot, phase: "uncertain", error });
      }
      return false;
    }
    pending = null;
    publish(initial);
    // A readback/rendering problem after this point cannot undo a confirmed receipt.
    if (viewing) {
      try {
        intent.confirmed(result);
      } catch {
        publish({
          ...initial,
          error: new Error(
            "Movimiento confirmado. No se pudo actualizar la pantalla; consulta sus recibos antes de continuar.",
          ),
        });
      }
    }
    return true;
  }
  return {
    ownerKey,
    activate: () => {
      viewing = true;
    },
    deactivate: () => {
      viewing = false;
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start<Input extends { clientRequestId: string }, Result extends object>(
      key: string,
      label: string,
      prepare: () => Input,
      send: (input: Input) => Promise<InventoryCommandResponse<Result>>,
      confirmed: (result: InventoryCommandResponse<object>) => void,
    ) {
      if (!viewing || pending) return false;
      try {
        const payload = structuredClone(prepare());
        pending = {
          execute: () => send(structuredClone(payload)),
          confirmed,
          uncertain: false,
        };
        publish({
          ...initial,
          key,
          label,
          clientRequestId: payload.clientRequestId,
        });
      } catch (error) {
        publish({ ...initial, error });
        return false;
      }
      void run();
      return true;
    },
    retry: run,
  };
}
