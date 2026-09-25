"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** Mount browser-only forms after hydration, keeping the server's first render identical. */
export function usePageClientReady() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
