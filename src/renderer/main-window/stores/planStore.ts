import { create } from 'zustand';
import type { DayPlan } from '@shared/domain.js';
import type { GeneratePlanRequest, PlannerState } from '@shared/ipc/channels.js';

/**
 * The generated plan for whichever day is on screen, plus what the planner has cost.
 *
 * `generating` is deliberately global rather than per-day: a generation takes roughly twenty
 * seconds, and the one thing the UI must never do is let a second one start while the first is
 * in flight. That would double the bill for a plan that gets overwritten anyway.
 */
interface PlanStore {
  plans: Record<string, DayPlan | null>;
  state: PlannerState | null;
  generating: boolean;
  /** A message written for the user, from a failed generation. */
  error: string | null;
  setError: (error: string | null) => void;
}

export const usePlanStore = create<PlanStore>((set) => ({
  plans: {},
  state: null,
  generating: false,
  error: null,
  setError: (error) => set({ error }),
}));

export function planFor(localDate: string): DayPlan | null {
  return usePlanStore.getState().plans[localDate] ?? null;
}

export async function loadPlan(localDate: string): Promise<void> {
  const plan = await window.thread.invoke['planner:get']({ localDate });
  usePlanStore.setState((state) => ({ plans: { ...state.plans, [localDate]: plan } }));
}

export async function refreshPlannerState(): Promise<void> {
  const state = await window.thread.invoke['planner:state'](undefined);
  usePlanStore.setState({ state });
}

/**
 * The only call in the app that spends money. Guarded against re-entry here as well as by the
 * button's disabled state, because a disabled button is a suggestion and this is not.
 */
export async function generatePlan(request: GeneratePlanRequest): Promise<boolean> {
  if (usePlanStore.getState().generating) return false;
  usePlanStore.setState({ generating: true, error: null });
  try {
    await window.thread.invoke['planner:generate'](request);
    await refreshPlannerState();
    return true;
  } catch (error: unknown) {
    usePlanStore.setState({ error: messageOf(error) });
    return false;
  } finally {
    usePlanStore.setState({ generating: false });
  }
}

export async function clearPlan(localDate: string): Promise<void> {
  await window.thread.invoke['planner:clear']({ localDate });
}

export async function initPlanStore(): Promise<void> {
  await refreshPlannerState();
  window.thread.on('planner:changed', ({ localDate, plan }) => {
    usePlanStore.setState((state) => ({ plans: { ...state.plans, [localDate]: plan } }));
  });
}

/**
 * An error crossing IPC arrives as `Error: <message>` — Electron prefixes the original message
 * with the class name. The planner writes messages meant to be read as sentences, so the prefix
 * is stripped rather than shown.
 */
function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^Error:\s*/, '');
}
