/**
 * Rollups are a cache; sessions and threads are truth. Every write path recomputes the affected
 * days from raw events using the same pure function `rebuild()` uses, so the two cannot drift.
 */
import path from 'node:path';
import type { DayRollup, MomentumScope, Rollups, ScopeSummary } from '@shared/analytics.js';
import type { Thread } from '@shared/domain.js';
import type { Database } from '../storage/Database.js';
import { atomicWriteFile, readFileIfExists } from '../storage/atomicWrite.js';
import { serialise } from '../storage/serialise.js';
import { computeDayRollup, datesTouched } from './rollups.js';
import { buildScopeSummary } from './scopes.js';

export class AnalyticsService {
  private rollups: Rollups = { version: 2, updatedAt: new Date().toISOString(), days: {} };
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly db: Database,
    private readonly onChanged: () => void,
  ) {}

  private get file(): string {
    return path.join(this.db.root, 'analytics', 'rollups.json');
  }

  async load(): Promise<void> {
    const raw = await readFileIfExists(this.file);
    if (!raw) {
      await this.rebuild();
      return;
    }
    try {
      const parsed = JSON.parse(raw) as Rollups;
      if (parsed.version !== 2 || typeof parsed.days !== 'object') throw new Error('stale rollups');
      this.rollups = parsed;
    } catch {
      // A derived cache is never worth a boot failure.
      await this.rebuild();
    }
  }

  /** Settings → Repair data, and the boot fallback. Full scan of every session and thread. */
  async rebuild(): Promise<void> {
    const sessions = await this.db.sessions.all();
    const threads = await this.everyThread();
    const timezone = this.db.clock.timezone();

    const days: Record<string, DayRollup> = {};
    for (const localDate of datesTouched(sessions, threads)) {
      days[localDate] = computeDayRollup(localDate, sessions, threads, timezone);
    }
    this.rollups = { version: 2, updatedAt: new Date().toISOString(), days };
    await this.persist();
    this.onChanged();
  }

  /**
   * Recomputes exactly the days an event touched. Called after every mutation, which is what
   * makes Analytics live without a refresh button.
   */
  async touchDays(localDates: string[]): Promise<void> {
    const unique = [...new Set(localDates)].filter(Boolean);
    if (unique.length === 0) return;

    const from = unique[0] as string;
    const to = unique[unique.length - 1] as string;
    const sessions = await this.db.sessions.inLocalDateRange(from, to);
    const threads = await this.db.threads.list();
    const timezone = this.db.clock.timezone();

    for (const localDate of unique) {
      const rollup = computeDayRollup(localDate, sessions, threads, timezone);
      // A day with nothing in it is removed rather than stored as zero: empty days must not
      // exist as records, or the trend chart starts drawing failures that never happened.
      if (rollup.sessionsStarted === 0 && rollup.stepsCompleted === 0 && rollup.threadsCompleted === 0) {
        delete this.rollups.days[localDate];
      } else {
        this.rollups.days[localDate] = rollup;
      }
    }
    this.rollups.updatedAt = new Date().toISOString();
    this.schedulePersist();
    this.onChanged();
  }

  async summary(scope: MomentumScope, anchor: string): Promise<ScopeSummary> {
    return buildScopeSummary({
      scope,
      anchor,
      rollups: this.rollups.days,
      threads: await this.db.threads.list(),
      today: this.db.clock.today(),
    });
  }

  snapshot(): Rollups {
    return this.rollups;
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, 1000);
    this.persistTimer.unref?.();
  }

  private async persist(): Promise<void> {
    await atomicWriteFile(this.file, serialise(this.rollups));
  }

  /** Active plus archived, deduped — a done thread can legitimately appear in both listings. */
  private async everyThread(): Promise<Thread[]> {
    const byId = new Map<string, Thread>();
    for (const thread of await this.db.threads.list()) byId.set(thread.id, thread);
    const archived = await this.db.threads.donePage({ limit: Number.MAX_SAFE_INTEGER });
    for (const thread of archived.threads) byId.set(thread.id, thread);
    return [...byId.values()];
  }
}
