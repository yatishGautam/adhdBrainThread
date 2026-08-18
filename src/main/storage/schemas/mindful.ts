import { z } from 'zod';
import type { MindfulSession } from '@shared/domain.js';
import { isoTimestamp, localDate, ulidLike } from './common.js';

/**
 * A sit. Recorded on the phone; this desktop only ever receives them, which is why there is no
 * repository that creates one — the sync engine is the sole writer.
 *
 * Kept out of `sessions` on purpose: momentum is computed from focus sessions, and a sit landing
 * in that collection would inflate the number until it stopped meaning anything.
 */
export const mindfulSessionSchema: z.ZodType<MindfulSession> = z.object({
  id: ulidLike,
  startedAt: isoTimestamp,
  endedAt: isoTimestamp.nullish(),
  localDate,
  plannedMs: z.number().nonnegative(),
  actualMs: z.number().nonnegative(),
  completed: z.boolean(),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish(),
});
