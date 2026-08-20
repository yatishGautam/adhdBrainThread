import { create } from 'zustand';
import type { DayPlan, WeekPlan } from '@shared/domain.js';
import type { GeneratePlanRequest, PlannerState } from '@shared/ipc/channels.js';
import { useUiStore } from './uiStore.js';

/**
 * The generated plans on screen — a week's worth of days, and the run that produced them — plus
 * what the planner has cost.
 *
 * `generating` is deliberately global rather than per-week: a run takes the better part of a
 * minute, and the one thing the UI must never do is let a second one start while the first is in
 * flight. That would double the bill for a plan that gets overwritten anyway.
 */
interface PlanStore {
  plans: Record<string, DayPlan | null>;
  weeks: Record<string, WeekPlan | null>;
  state: PlannerState | null;
  generating: boolean;
  /** A message written for the user, from a failed generation. */
  error: string | null;
  setError: (error: string | null) => void;
}

export const usePlanStore = create<PlanStore>((set) => ({
  plans: {},
  weeks: {},
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

/** A week's run and every day of it, in one round trip. */
export async function loadWeekPlan(weekKey: string): Promise<void> {
  const { week, days } = await window.thread.invoke['planner:week']({ weekKey });
  usePlanStore.setState((state) => ({
    weeks: { ...state.weeks, [weekKey]: week },
    plans: {
      ...state.plans,
      ...Object.fromEntries(days.map((plan) => [plan.localDate, plan])),
    },
  }));
}

export async function refreshPlannerState(): Promise<void> {
  const state = await window.thread.invoke['planner:state'](undefined);
  usePlanStore.setState({ state });
}

/**
 * The only call in the app that spends money, and the slowest thing it does.
 *
 * This resolves when the run *starts*, not when it finishes — the plan takes the better part of
 * a minute and arrives through sync, announced on `planner:runFinished`. So `generating` is not
 * cleared here: it is cleared by that event, which is also what fires if the window was on
 * another page the whole time, or if the run failed.
 *
 * Guarded against re-entry here as well as by the button's disabled state, because a disabled
 * button is a suggestion and this is not — and again on the server, which is the only guard that
 * holds when the phone presses the button at the same moment.
 */
export async function generatePlan(request: GeneratePlanRequest): Promise<boolean> {
  if (usePlanStore.getState().generating) return false;
  usePlanStore.setState({ generating: true, error: null });
  try {
    await window.thread.invoke['planner:generate'](request);
    return true;
  } catch (error: unknown) {
    // Only the *start* failed — signed out, rate limited, no key. Nothing is running, so the
    // spinner has to come down here; a finished event will never arrive.
    usePlanStore.setState({ error: messageOf(error), generating: false });
    return false;
  }
}

export async function clearPlan(localDate: string): Promise<void> {
  await window.thread.invoke['planner:clear']({ localDate });
}

/** The day-sized sibling of `generatePlan`, same money, same contract, smaller window. */
export async function generateDayPlan(request: {
  localDate: string;
  note?: string;
}): Promise<boolean> {
  if (usePlanStore.getState().generating) return false;
  usePlanStore.setState({ generating: true, error: null });
  try {
    await window.thread.invoke['planner:generateDay'](request);
    return true;
  } catch (error: unknown) {
    usePlanStore.setState({ error: messageOf(error), generating: false });
    return false;
  }
}

export async function initPlanStore(): Promise<void> {
  await refreshPlannerState();
  window.thread.on('planner:changed', ({ localDate, plan }) => {
    usePlanStore.setState((state) => ({ plans: { ...state.plans, [localDate]: plan } }));
  });
  // A run rewrites several days at once, and a sync from the phone can do the same. Taking the
  // whole week from one event means no view has to work out which days changed.
  window.thread.on('planner:weekChanged', ({ weekKey, week, days }) => {
    usePlanStore.setState((state) => ({
      weeks: { ...state.weeks, [weekKey]: week },
      plans: {
        ...state.plans,
        ...Object.fromEntries(days.map((plan) => [plan.localDate, plan])),
      },
    }));
  });
  // The run ended — on this device or, just as possibly, because the phone pressed the button.
  // Either way the spinner comes down here rather than where it went up.
  window.thread.on('planner:runFinished', ({ error }) => {
    usePlanStore.setState({ generating: false, ...(error ? { error } : {}) });
    void refreshPlannerState();
  });
  // A clicked block nudge lands on the Daily page — right next to the block's Start button,
  // which is the whole point of the click.
  window.thread.on('planner:nudge', () => {
    useUiStore.getState().setTab('today');
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
