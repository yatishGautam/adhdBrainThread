/**
 * The planner's contract with the server, shared by main and renderer.
 *
 * These types exist here rather than in `domain.ts` because they are not records — they are the
 * shape of one request and one reply. `WeekPlanResult` is what `POST /plan/week` answers with,
 * and it is deliberately the same two record types sync carries, so the button and the next sync
 * tick cannot disagree about what a plan is.
 */
import type { DayPlan, WeekPlan } from './domain.js';

export interface WeekPlanRequest {
  /** This device's today, stamped from its own timezone. The server never derives it. */
  localDate: string;
  /** Overrides for the day's frame. Omitted means "use the synced settings". */
  wakeTime?: string;
  startTime?: string;
  endTime?: string;
  /** About this week specifically. Never stored — it is about one week, not a preference. */
  note?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
}

/**
 * What `POST /plan/week` answers with: an acknowledgement, not a plan.
 *
 * The plan takes the better part of a minute and does not come back down that request — iOS
 * kills a connection held that long in the background as routine behaviour, and a killed request
 * would abandon a generation already paid for. The result is written server-side and arrives
 * through sync instead, on every device rather than only the one that pressed the button.
 */
export interface WeekPlanAccepted {
  weekKey: string;
  startedAt: string;
  /** The days this run covers. Enough to show what is being waited for. */
  dates: string[];
}

/** `POST /plan/day` — replan the rest of today from a wall-clock "now". */
export interface DayPlanRequest {
  localDate: string;
  /** The moment the replanned day starts from. What already happened stays as it was. */
  fromTime: string;
  /** About right now specifically — "the meeting blew up, dentist at 4". Never stored. */
  note?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
}

export type PlanRunStatus = 'idle' | 'running' | 'done' | 'failed';

/** Whether a run is still going. A courtesy for the spinner; sync is what delivers. */
export interface PlanRunState {
  status: PlanRunStatus;
  weekKey?: string;
  startedAt?: string;
  finishedAt?: string;
  /** Written for the user, from a failed run. */
  error?: string;
}

export interface WeekPlanResult {
  weekPlan: WeekPlan;
  /** One per day the server actually planned: today through Sunday. */
  plans: DayPlan[];
}
