/** Cancel both the debounce and an already-started request on query changes. */
export function startDebouncedRequest<Result>(
  request: (signal: AbortSignal) => Promise<Result>,
  onSuccess: (result: Result) => void,
  onError: (error: unknown) => void,
  delayMs: number,
): () => void {
  const controller = new AbortController();
  const timer = setTimeout(async () => {
    try {
      const result = await request(controller.signal);
      if (!controller.signal.aborted) onSuccess(result);
    } catch (error: unknown) {
      if (!controller.signal.aborted) onError(error);
    }
  }, delayMs);

  return () => {
    clearTimeout(timer);
    controller.abort();
  };
}
