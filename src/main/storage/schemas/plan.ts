import { z } from 'zod';
import type { DayPlan, PlanBlock, PlanUsage } from '@shared/domain.js';
import { isoTimestamp, localDate, ulidLike } from './common.js';

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
  id: ulidLike,
  start: clockTime,
  end: clockTime,
  kind: planBlockKind,
  title: z.string(),
  why: z.string().optional(),
  threadId: ulidLike.optional(),
  todoId: ulidLike.optional(),
  goalId: ulidLike.optional(),
});

export const planUsageSchema: z.ZodType<PlanUsage> = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
});

export const dayPlanSchema: z.ZodType<DayPlan> = z.object({
  localDate,
  generatedAt: isoTimestamp,
  wakeTime: clockTime,
  startTime: clockTime,
  endTime: clockTime,
  blocks: z.array(planBlockSchema),
  headline: z.string(),
  deferred: z.array(z.string()),
  model: z.string(),
  usage: planUsageSchema,
});

/**
 * What the model is asked to return, which is deliberately not `DayPlan`.
 *
 * Three fields are missing on purpose — `id`, `model` and `usage` are facts about the request,
 * not opinions about the day, and letting the model supply them would mean trusting it to report
 * its own token spend. They are stamped locally once the reply lands.
 *
 * The ids it *is* allowed to send are plain strings here rather than `ulidLike`, because a
 * hallucinated id must not fail the whole parse — `PlannerService` checks each one against the
 * real records and drops the ones that do not exist. A wrong id should cost the block its Start
 * button, not cost the user their plan.
 *
 * Every `.describe()` below is prompt text: the SDK turns this schema into the JSON Schema sent
 * as `output_config.format`, so the descriptions are what the model actually reads about each
 * field. They live here, next to the constraint they explain, rather than in the system prompt.
 */
export const plannedBlockReplySchema = z.object({
  start: clockTime.describe('24-hour HH:MM local time.'),
  end: clockTime.describe('24-hour HH:MM local time, later than start.'),
  kind: planBlockKind.describe(
    'focus for deep work, admin for batched shallow tasks, break/meal/buffer for recovery and transitions, wind_down to close the day.',
  ),
  title: z.string().min(1).describe('What to actually do, concretely, in plain words.'),
  why: z
    .string()
    .optional()
    .describe('One short line on why this belongs here, now. Omit if it is obvious.'),
  threadId: z
    .string()
    .optional()
    .describe(
      'The id of an existing thread this block works on, copied exactly from the context. Omit it if this block is not one of those threads. Never invent an id.',
    ),
  todoId: z
    .string()
    .optional()
    .describe('The id of an existing to-do this block clears, copied exactly. Otherwise omit.'),
  goalId: z
    .string()
    .optional()
    .describe('The id of the weekly goal this block advances, copied exactly. Otherwise omit.'),
});

export const planReplySchema = z.object({
  headline: z
    .string()
    .describe(
      'Two or three sentences addressed to the user: the shape of the day, and the one thing that actually matters today.',
    ),
  blocks: z
    .array(plannedBlockReplySchema)
    .describe('The whole day in order, earliest first. Blocks must not overlap.'),
  deferred: z
    .array(z.string())
    .describe(
      'What you consciously left out of today, each a short line the user can read and push back on. Empty array if you dropped nothing.',
    ),
});

export type PlanReply = z.infer<typeof planReplySchema>;
