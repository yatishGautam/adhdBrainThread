/**
 * The four collections and how they are keyed.
 *
 * `threads/active.json` is deliberately unsharded — it is bounded by the WIP cap and will never
 * be large. Only the historical, append-dominant collections shard.
 */
import type { Day, Session, Thread } from '@shared/domain.js';
import { daySchema } from './schemas/day.js';
import { sessionSchema } from './schemas/session.js';
import { threadSchema } from './schemas/thread.js';
import { defineCollection, type AnyCollectionConfig } from './types.js';

export const COLLECTION = {
  activeThreads: 'threads',
  archivedThreads: 'threadArchive',
  days: 'days',
  sessions: 'sessions',
} as const;

export const collections: AnyCollectionConfig[] = [
  defineCollection<Thread>({
    name: COLLECTION.activeThreads,
    dir: 'threads',
    prefix: 'thr',
    singleFile: 'threads/active.json',
    schema: threadSchema,
    key: (thread) => thread.id,
    updatedAt: (thread) => thread.updatedAt,
  }),
  defineCollection<Thread>({
    name: COLLECTION.archivedThreads,
    dir: 'threads/archive',
    prefix: 'thr',
    schema: threadSchema,
    key: (thread) => thread.id,
    updatedAt: (thread) => thread.updatedAt,
  }),
  defineCollection<Day>({
    name: COLLECTION.days,
    dir: 'days',
    prefix: 'day',
    schema: daySchema,
    key: (day) => day.localDate,
    updatedAt: (day) => day.createdAt,
  }),
  defineCollection<Session>({
    name: COLLECTION.sessions,
    dir: 'sessions',
    prefix: 'ses',
    schema: sessionSchema,
    key: (session) => session.id,
    updatedAt: (session) => session.endedAt ?? session.startedAt,
  }),
];
