import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventChannel, Events, Requests } from '@shared/ipc/channels.js';

/** Subscribes to a main→renderer broadcast for the lifetime of the component. */
export function useIpcEvent<K extends EventChannel>(
  channel: K,
  handler: (payload: Events[K]) => void,
): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => window.thread.on(channel, (payload) => ref.current(payload)), [channel]);
}

/** Wraps an invoke call with loading/error state, for one-shot fetches on mount. */
export function useIpcQuery<K extends keyof Requests>(
  channel: K,
  payload: Requests[K][0],
  deps: unknown[] = [],
): { data: Requests[K][1] | null; loading: boolean; refetch: () => void } {
  const [data, setData] = useState<Requests[K][1] | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.thread.invoke[channel](payload).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, tick, ...deps]);

  const refetch = useCallback(() => setTick((n) => n + 1), []);
  return { data, loading, refetch };
}

export function useInvoke(): typeof window.thread.invoke {
  return window.thread.invoke;
}
