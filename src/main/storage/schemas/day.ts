import { z } from 'zod';
import type { Blocker, Day, LogEntry, Thought, Todo } from '@shared/domain.js';
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
  note: z.string().optional(),
});

export const blockerSchema: z.ZodType<Blocker> = z.object({
  id: ulidLike,
  text: z.string(),
  resolved: z.boolean(),
  localDate,
  createdAt: isoTimestamp,
  resolvedAt: isoTimestamp.optional(),
});

export const logEntrySchema: z.ZodType<LogEntry> = z.object({
  id: ulidLike,
  text: z.string(),
  at: isoTimestamp,
  localDate,
  source: z.enum(['manual', 'todo', 'focus', 'thread']),
});

export const daySchema: z.ZodType<Day> = z.object({
  localDate,
  createdAt: isoTimestamp,
  intentThreadIds: z.array(ulidLike),
  todos: z.array(todoSchema),
  thoughts: z.array(thoughtSchema),
  loggedThreadIds: z.array(ulidLike),
  note: z.string().optional(),
  // Optional throughout: day files written before these fields existed must keep parsing.
  now: z.string().optional(),
  blockers: z.array(blockerSchema).optional(),
  log: z.array(logEntrySchema).optional(),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish(),
});
