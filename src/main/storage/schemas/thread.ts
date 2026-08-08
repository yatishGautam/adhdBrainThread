import { z } from 'zod';
import type { Step, Thread } from '@shared/domain.js';
import { isoTimestamp, localDate, ulidLike } from './common.js';

export const stepSchema: z.ZodType<Step> = z.object({
  id: ulidLike,
  text: z.string(),
  done: z.boolean(),
  order: z.number(),
  completedAt: isoTimestamp.optional(),
  completedLocalDate: localDate.optional(),
});

export const threadSchema: z.ZodType<Thread> = z.object({
  id: ulidLike,
  title: z.string(),
  notes: z.string(),
  status: z.enum(['idle', 'in_progress', 'waiting', 'done']),
  steps: z.array(stepSchema),
  waitingOn: z.string().optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  completedAt: isoTimestamp.optional(),
  completedLocalDate: localDate.optional(),
  totalFocusMs: z.number().nonnegative(),
  sessionCount: z.number().nonnegative(),
  distractionCount: z.number().nonnegative(),
  archived: z.boolean(),
});
