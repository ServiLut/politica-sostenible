/** Publishes a stable snapshot of a browser store without reading it during SSR. */
export function createSessionStore<T>(
  read: () => T | null,
  listen: (onChange: () => void) => () => void,
) {
  let snapshot: T | null | undefined;
  let disconnect: (() => void) | undefined;
  let reading = false;
  const listeners = new Set<() => void>();
  const synchronize = () => {
    // Reading expired/invalid session data can clear it and emit a nested event.
    if (reading) return;
    reading = true;
    try {
      snapshot = read();
    } finally {
      reading = false;
    }
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => undefined,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!disconnect) disconnect = listen(synchronize);
      synchronize();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          disconnect?.();
          disconnect = undefined;
          snapshot = undefined;
        }
      };
    },
  };
}
