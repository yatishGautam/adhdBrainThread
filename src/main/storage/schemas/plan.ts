import { z } from 'zod';
import type { DayPlan, DayRun, PlanBlock, PlanUsage, WeekPlan } from '@shared/domain.js';
import { isoTimestamp, localDate, ulidLike } from './common.js';
import { weekKey } from './goal.js';

/** `HH:MM`, 24-hour. Shared by the stored plan and the model's reply. */
export const clockTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected a 24-hour HH:MM time');

export const planBlockKind = z.enum([
  'focus',
  'break',
  'admin',
  'meal',
  'buffer',
  'wind_down',
]);

export const planBlockSchema: z.ZodType<PlanBlock> = z.object({
  // Not `ulidLike`: the server derives block ids from the day and the block's position
  // (`20260820-00`), so they are stable across a regeneration instead of churning every time.
  id: z.string().min(1),
  start: clockTime,
  end: clockTime,
  kind: planBlockKind,
  title: z.string(),
  why: z.string().optional(),
  threadId: ulidLike.optional(),
  todoId: ulidLike.optional(),
  goalId: ulidLike.optional(),
  promoted: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

export const planUsageSchema: z.ZodType<PlanUsage> = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
});

export const dayPlanSchema: z.ZodType<DayPlan> = z.object({
  localDate,
  // Optional so plan files written by the old local planner still validate — those predate week
  // plans and have no week to point at. Every plan written since carries it.
  weekKey: weekKey.optional(),
  generatedAt: isoTimestamp,
  wakeTime: clockTime,
  startTime: clockTime,
  endTime: clockTime,
  blocks: z.array(planBlockSchema),
  headline: z.string(),
  // Same reason, and the same three fields that moved to `WeekPlan` when a run started
  // producing several days at once.
  deferred: z.array(z.string()).optional(),
  model: z.string().optional(),
  usage: planUsageSchema.optional(),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish(),
});

export const weekPlanSchema: z.ZodType<WeekPlan> = z.object({
  weekKey,
  generatedAt: isoTimestamp,
  fromDate: localDate,
  toDate: localDate,
  headline: z.string(),
  deferred: z.array(z.string()),
  model: z.string(),
  usage: planUsageSchema,
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish(),
});

/*
 * The reply schema that used to live here — what the model was asked to return, with its
 * `.describe()` calls doubling as prompt text — moved to the server with the rest of the
 * planner. It is `src/planner/reply.ts` in the backend repo. Nothing in this app parses a model
 * reply any more: it asks for a plan and stores what comes back, already validated.
 */

export const dayRunSchema: z.ZodType<DayRun> = z.object({
  localDate,
  startedAt: isoTimestamp,
  endedAt: isoTimestamp.nullish(),
  shiftMs: z.number().int(),
  shiftFrom: clockTime.optional(),
  skippedBlockIds: z.array(z.string()),
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullish(),
});
