import { useCallback, useEffect, useRef, useState } from "react";
import type { DryRunInput, DryRunResult, EvaluatorAdapter } from "../types.js";

export interface DryRunState {
  readonly result: DryRunResult | null;
  readonly running: boolean;
}

export interface UseDryRunApi extends DryRunState {
  /** Run immediately, aborting any in-flight debounce or request. */
  readonly run: (input: DryRunInput) => Promise<DryRunResult | null>;
  /** Run after `delayMs`, replacing a pending evaluation. */
  readonly runDebounced: (input: DryRunInput, delayMs?: number) => void;
  readonly cancel: () => void;
  readonly reset: () => void;
}

/**
 * Debounced dry-run controller shared by the gateway studio and `/playground`.
 *
 * The adapter owns all evaluation semantics; this hook only manages cancellation
 * and loading state. No result is fabricated when a request is superseded.
 */
export function useDryRun(
  adapter: EvaluatorAdapter,
  options: { readonly defaultDelayMs?: number } = {},
): UseDryRunApi {
  const [state, setState] = useState<DryRunState>({
    result: null,
    running: false,
  });
  const controllerRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const defaultDelay = options.defaultDelayMs ?? 650;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    clearTimer();
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState((current) => ({ ...current, running: false }));
  }, [clearTimer]);

  const run = useCallback(
    async (input: DryRunInput): Promise<DryRunResult | null> => {
      clearTimer();
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ result: null, running: true });

      const result = await adapter.dryRun(input, { signal: controller.signal });
      if (!mountedRef.current || controller.signal.aborted) return null;
      setState({ result, running: false });
      return result;
    },
    [adapter, clearTimer],
  );

  const runDebounced = useCallback(
    (input: DryRunInput, delayMs: number = defaultDelay) => {
      clearTimer();
      controllerRef.current?.abort();
      controllerRef.current = null;
      // Invalidate the displayed result immediately so a stale candidate SHA
      // or verdict cannot survive an edit during the debounce window.
      setState({ result: null, running: false });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void run(input);
      }, Math.max(0, delayMs));
    },
    [clearTimer, defaultDelay, run],
  );

  const reset = useCallback(() => {
    clearTimer();
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ result: null, running: false });
  }, [clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
      controllerRef.current?.abort();
    };
  }, [clearTimer]);

  return { ...state, run, runDebounced, cancel, reset };
}
