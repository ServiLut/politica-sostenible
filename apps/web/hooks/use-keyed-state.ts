"use client";

import { useCallback, useState, type SetStateAction } from "react";

/** Reset record-specific form values at selection changes, before displaying them. */
export function useKeyedState<T>(key: unknown, initialValue: T) {
  const [state, setState] = useState({ key, value: initialValue });
  if (state.key !== key) {
    // Guarded adjustment of this component's state keeps A -> B -> A from
    // resurrecting an earlier confirmation without an intermediate effect.
    setState({ key, value: initialValue });
  }
  const value = state.key === key ? state.value : initialValue;
  const setValue = useCallback((update: SetStateAction<T>) => {
    setState((previous) => previous.key !== key ? previous : ({
      key,
      value: typeof update === "function"
        ? (update as (previousValue: T) => T)(previous.value)
        : update,
    }));
  }, [key]);
  return [value, setValue] as const;
}
