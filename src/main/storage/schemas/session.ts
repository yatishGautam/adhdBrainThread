import { z } from 'zod';
import type { Distraction, Pause, Session } from '@shared/domain.js';
import { isoTimestamp, localDate, ulidLike } from './common.js';

export const distractionSchema: z.ZodType<Distraction> = z.object({
  id: ulidLike,
  at: isoTimestamp,
  kind: z.enum(['internal', 'external', 'unspecified']),
  note: z.string().optional(),
  grantedMs: z.number().nonnegative(),
});

export const pauseSchema: z.ZodType<Pause> = z.object({
  at: isoTimestamp,
  resumedAt: isoTimestamp.optional(),
});

export const sessionSchema: z.ZodType<Session> = z.object({
  id: ulidLike,
  threadId: ulidLike,
  startedAt: isoTimestamp,
  endedAt: isoTimestamp.optional(),
  localDate,
  plannedMs: z.number().nonnegative(),
  activeMs: z.number().nonnegative(),
  grantedMs: z.number().nonnegative(),
  outcome: z.enum(['completed', 'ended_early', 'switched', 'abandoned', 'recovered']),
  switchedToThreadId: ulidLike.optional(),
  distractions: z.array(distractionSchema),
  pauses: z.array(pauseSchema),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish(),
});
