import { z } from 'zod';
import type { Day, Thought, Todo } from '@shared/domain.js';
import { isoTimestamp, localDate, ulidLike } from './common.js';

export const todoSchema: z.ZodType<Todo> = z.object({
  id: ulidLike,
  text: z.string(),
  done: z.boolean(),
  localDate,
  createdAt: isoTimestamp,
  completedAt: isoTimestamp.optional(),
  promotedToThreadId: ulidLike.optional(),
  order: z.number(),
});

export const thoughtSchema: z.ZodType<Thought> = z.object({
  id: ulidLike,
  text: z.string(),
  createdAt: isoTimestamp,
  localDate,
  processed: z.boolean(),
});

export const daySchema: z.ZodType<Day> = z.object({
  localDate,
  createdAt: isoTimestamp,
  intentThreadIds: z.array(ulidLike),
  todos: z.array(todoSchema),
  thoughts: z.array(thoughtSchema),
  loggedThreadIds: z.array(ulidLike),
  note: z.string().optional(),
});
