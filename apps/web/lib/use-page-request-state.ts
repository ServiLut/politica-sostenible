export interface PageRequestSnapshot<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  receivedAt: number | null;
}

/** Request lifecycle kept outside rendering so it can be tested without a browser. */
export function createPageRequestState<T>(
  request: (signal: AbortSignal) => Promise<T>,
  enabled = true,
  retainDataOnRefresh = false,
) {
  const initial: PageRequestSnapshot<T> = {
    data: null,
    error: null,
    loading: enabled,
    receivedAt: null,
  };
  let snapshot = initial;
  let mounted = false;
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();

  function publish(next: PageRequestSnapshot<T>) {
    if (!mounted) return;
    snapshot = next;
    for (const listener of listeners) listener();
  }

  async function run(): Promise<T | undefined> {
    active?.abort();
    const controller = new AbortController();
    active = controller;
    try {
      const data = await request(controller.signal);
      if (!mounted || active !== controller || controller.signal.aborted)
        return;
      publish({ data, error: null, loading: false, receivedAt: Date.now() });
      return data;
    } catch (error: unknown) {
      if (mounted && active === controller && !controller.signal.aborted) {
        publish({
          data: retainDataOnRefresh ? snapshot.data : null,
          error,
          loading: false,
          receivedAt:
            retainDataOnRefresh && snapshot.data !== null
              ? snapshot.receivedAt
              : Date.now(),
        });
      }
      return undefined;
    }
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initial,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      mounted = true;
      if (!enabled) return;
      if (snapshot !== initial) publish(initial);
      return run();
    },
    stop() {
      mounted = false;
      active?.abort();
      active = null;
    },
    async refresh(): Promise<T | undefined> {
      if (!mounted || !enabled) return;
      publish(
        retainDataOnRefresh && snapshot.data !== null
          ? { ...snapshot, error: null, loading: true }
          : initial,
      );
      return run();
    },
    setData(update: T | null | ((current: T | null) => T | null)) {
      if (!mounted || !enabled) return;
      active?.abort();
      active = null;
      const data =
        typeof update === "function"
          ? (update as (current: T | null) => T | null)(snapshot.data)
          : update;
      publish({ data, error: null, loading: false, receivedAt: Date.now() });
    },
  };
}
