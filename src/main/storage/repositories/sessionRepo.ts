import type { Session } from '@shared/domain.js';
import { ulidTime } from '@shared/ids.js';
import { COLLECTION } from '../collections.js';
import type { CollectionHandle, ShardedStore } from '../ShardedStore.js';

/** Slack around a date range, so a shard straddling a timezone boundary is never skipped. */
const RANGE_SLACK_MS = 2 * 86_400_000;

export class SessionRepo {
  constructor(private readonly store: ShardedStore) {}

  private get sessions(): CollectionHandle<Session> {
    return this.store.collection<Session>(COLLECTION.sessions);
  }

  async get(id: string): Promise<Session | null> {
    return this.sessions.get(id);
  }

  async save(session: Session): Promise<void> {
    await this.sessions.put(session);
  }

  async all(): Promise<Session[]> {
    return this.sessions.all();
  }

  async forThread(threadId: string): Promise<Session[]> {
    const all = await this.sessions.all();
    return all
      .filter((session) => session.threadId === threadId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /**
   * Sessions falling on local dates in [from, to]. Session ids are ULIDs, so the timestamp
   * embedded in each shard's key bounds tells us which shards cannot possibly contain the
   * range — that is what keeps analytics from loading three years of history to draw one week.
   */
  async inLocalDateRange(from: string, to: string): Promise<Session[]> {
    const lower = Date.parse(`${from}T00:00:00.000Z`) - RANGE_SLACK_MS;
    const upper = Date.parse(`${to}T23:59:59.999Z`) + RANGE_SLACK_MS;
    const out: Session[] = [];

    for (const shard of this.sessions.shards()) {
      if (ulidTime(shard.maxKey) < lower || ulidTime(shard.minKey) > upper) continue;
      const records = await this.sessions.recordsIn(shard.id);
      out.push(...records.filter((session) => session.localDate >= from && session.localDate <= to));
    }
    return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  /** Walks shards newest-first; used to find a session left open by a crash. */
  async findOpen(): Promise<Session | null> {
    for (const shard of this.sessions.shards()) {
      const records = await this.sessions.recordsIn(shard.id);
      const open = records
        .filter((session) => !session.endedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
      if (open) return open;
    }
    return null;
  }
}
