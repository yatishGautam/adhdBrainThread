import { z } from 'zod';
import type { Goal } from '@shared/domain.js';
import { isoTimestamp, localDate, ulidLike } from './common.js';

export const weekKey = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, 'expected an ISO week key like 2026-W34');

export const goalSchema: z.ZodType<Goal> = z.object({
  id: ulidLike,
  title: z.string(),
  done: z.boolean(),
  // Never optional, unlike most late-added fields: goals did not exist before this schema, so
  // there is no file on disk without it and defaulting would only hide a real bug.
  context: z.string(),
  weekKey,
  order: z.number(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  completedAt: isoTimestamp.optional(),
  completedLocalDate: localDate.optional(),
  carriedFromWeek: weekKey.optional(),
  deletedAt: isoTimestamp.nullish(),
});
