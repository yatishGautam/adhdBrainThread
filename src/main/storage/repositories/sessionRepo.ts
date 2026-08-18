import type { Session } from '@shared/domain.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';

export class SessionRepo {
  constructor(private readonly store: Store) {}

  /** Not deleted. See `ThreadRepo.live` for why tombstones stay on disk. */
  private async live(): Promise<Session[]> {
    return (await this.sessions.all()).filter((session) => !session.deletedAt);
  }

  private get sessions(): Collection<Session> {
    return this.store.collection<Session>(COLLECTION.sessions);
  }

  async get(id: string): Promise<Session | null> {
    const session = await this.sessions.get(id);
    return session && !session.deletedAt ? session : null;
  }

  /**
   * `updatedAt` is stamped here, on the one write path, rather than by each caller. It is when
   * the user made the change, and it is the entire conflict rule — a record that reaches the
   * server without it loses to whatever is already there.
   */
  async save(session: Session): Promise<void> {
    await this.sessions.put({ ...session, updatedAt: new Date().toISOString() });
  }

  async all(): Promise<Session[]> {
    return this.live();
  }

  async forThread(threadId: string): Promise<Session[]> {
    const all = await this.live();
    return all
      .filter((session) => session.threadId === threadId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  /**
   * Sessions falling on local dates in [from, to]. This used to reason about ULID timestamps to
   * decide which shards it could skip; everything is already in memory now, so it is a filter.
   */
  async inLocalDateRange(from: string, to: string): Promise<Session[]> {
    const all = await this.live();
    return all
      .filter((session) => session.localDate >= from && session.localDate <= to)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  /** A session left open by a crash — the most recent one that never got an end time. */
  async findOpen(): Promise<Session | null> {
    const all = await this.live();
    return (
      all
        .filter((session) => !session.endedAt)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null
    );
  }
}
