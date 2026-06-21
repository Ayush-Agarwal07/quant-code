"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
}

/**
 * Fetch helper for "use client" pages: runs `fn` once per dep change inside an
 * AbortController-guarded effect. Never throws — surfaces errors as state so the
 * UI can render a friendly empty/error state instead of crashing.
 */
export function useApi<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList = []
): ApiState<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fn(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const e =
          err instanceof ApiError
            ? err
            : new ApiError(0, err instanceof Error ? err.message : "unknown error");
        setState({ data: null, loading: false, error: e });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
