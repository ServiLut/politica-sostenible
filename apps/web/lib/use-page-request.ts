"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { createPageRequestState } from "./use-page-request-state";

/** A response belongs to one query. Changing the query hides its old snapshot immediately. */
export function usePageRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  {
    enabled = true,
    reloadKey = 0,
    retainDataOnRefresh = false,
  }: {
    enabled?: boolean;
    reloadKey?: unknown;
    retainDataOnRefresh?: boolean;
  } = {},
) {
  const query = useMemo(
    () => ({ request, enabled, reloadKey, retainDataOnRefresh }),
    [request, enabled, reloadKey, retainDataOnRefresh],
  );
  const state = useMemo(
    () =>
      createPageRequestState(
        query.request,
        query.enabled,
        query.retainDataOnRefresh,
      ),
    [query],
  );
  const snapshot = useSyncExternalStore(
    state.subscribe,
    state.getSnapshot,
    state.getServerSnapshot,
  );

  useEffect(() => {
    void state.start();
    return state.stop;
  }, [state]);

  return {
    ...snapshot,
    refresh: state.refresh,
    setData: state.setData,
  };
}
