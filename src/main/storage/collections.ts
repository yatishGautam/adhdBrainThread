/**
 * The three collections and how they are keyed and split.
 *
 * Threads live in one file: the active cap plus a done pile bounds it by construction. Days and
 * sessions split by month so no file grows without limit and a month is easy to open by hand.
 */
import type { Day, MindfulSession, Session, Thread } from '@shared/domain.js';
import { daySchema } from './schemas/day.js';
import { mindfulSessionSchema } from './schemas/mindful.js';
import { sessionSchema } from './schemas/session.js';
import { threadSchema } from './schemas/thread.js';
import { defineCollection, type AnySpec } from './JsonStore.js';
import { COLLECTION } from './Store.js';

/** `2026-08-13` → `2026-08`. Both keys are local dates, so this needs no timezone logic. */
function monthOf(localDate: string): string {
  return localDate.slice(0, 7);
}

export const collections: AnySpec[] = [
  defineCollection<Thread>({
    name: COLLECTION.threads,
    schema: threadSchema,
    key: (thread) => thread.id,
  }),
  defineCollection<Day>({
    name: COLLECTION.days,
    schema: daySchema,
    key: (day) => day.localDate,
    partition: (day) => monthOf(day.localDate),
  }),
  defineCollection<Session>({
    name: COLLECTION.sessions,
    schema: sessionSchema,
    key: (session) => session.id,
    // Bucketed by the local date already stamped on the record at write time, never re-derived
    // from the UTC timestamp — that is how sessions land on the wrong side of a DST boundary.
    partition: (session) => monthOf(session.localDate),
  }),
  defineCollection<MindfulSession>({
    name: COLLECTION.mindful,
    schema: mindfulSessionSchema,
    key: (sit) => sit.id,
    partition: (sit) => monthOf(sit.localDate),
  }),
];

export { COLLECTION };
