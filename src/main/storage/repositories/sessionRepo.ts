import type { Session } from '@shared/domain.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';

export class SessionRepo {
  constructor(private readonly store: Store) {}

  private get sessions(): Collection<Session> {
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
   * Sessions falling on local dates in [from, to]. This used to reason about ULID timestamps to
   * decide which shards it could skip; everything is already in memory now, so it is a filter.
   */
  async inLocalDateRange(from: string, to: string): Promise<Session[]> {
    const all = await this.sessions.all();
    return all
      .filter((session) => session.localDate >= from && session.localDate <= to)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  /** A session left open by a crash — the most recent one that never got an end time. */
  async findOpen(): Promise<Session | null> {
    const all = await this.sessions.all();
    return (
      all
        .filter((session) => !session.endedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
    );
  }
}
