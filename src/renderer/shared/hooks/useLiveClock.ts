import { useEffect, useState } from 'react';
import type { SessionTick } from '@shared/ipc/channels.js';
import { useIpcEvent } from './useIpc.js';

/**
 * The authoritative clock lives in main; this just holds the last tick broadcast so a HUD or
 * Now panel re-render can read `remainingMs` without owning any timer of its own.
 */
export function useLiveClock(sessionId: string | null): SessionTick | null {
  const [tick, setTick] = useState<SessionTick | null>(null);

  useEffect(() => {
    if (!sessionId) setTick(null);
  }, [sessionId]);

  useIpcEvent('session:tick', (payload) => {
    if (!sessionId || payload.sessionId === sessionId) setTick(payload);
  });

  return tick;
}
