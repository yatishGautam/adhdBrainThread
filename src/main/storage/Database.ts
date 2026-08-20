/**
 * Everything above this line is storage; everything below it is features. Features call
 * repositories, never the store itself — which is what keeps JSON swappable for an HTTP
 * backend without touching a single service or renderer.
 */
import { collections } from './collections.js';
import type { CollectionName } from './Store.js';
import { systemClock, type Clock } from './clock.js';
import { JsonStore } from './JsonStore.js';
import { migrate, type MigrationReport } from './migrate.js';
import { DayRepo } from './repositories/dayRepo.js';
import { GoalRepo } from './repositories/goalRepo.js';
import { DayRunRepo } from './repositories/dayRunRepo.js';
import { PlanRepo } from './repositories/planRepo.js';
import { SessionRepo } from './repositories/sessionRepo.js';
import { SettingsRepo } from './repositories/settingsRepo.js';
import { ThreadRepo } from './repositories/threadRepo.js';

export interface DatabaseEvents {
  /** A file could not be read. The app carries on; the user is told what was skipped. */
  onUnreadable?: (file: string, reason: string) => void;
  /** Every local write, for the sync queue. See `JsonStoreEvents.onWrite`. */
  onWrite?: (collection: CollectionName, key: string) => void;
}

export class Database {
  private constructor(
    readonly root: string,
    readonly store: JsonStore,
    readonly clock: Clock,
    readonly threads: ThreadRepo,
    readonly days: DayRepo,
    readonly goals: GoalRepo,
    readonly plans: PlanRepo,
    readonly dayRuns: DayRunRepo,
    readonly sessions: SessionRepo,
    readonly settings: SettingsRepo,
    readonly migration: MigrationReport,
  ) {}

  static async open(root: string, events: DatabaseEvents = {}): Promise<Database> {
    const settings = new SettingsRepo(root);
    await settings.load();
    const clock = systemClock(() => settings.get().timezone);

    // Before anything opens a file: converts the old sharded layout in place, once.
    const migration = await migrate(root);

    const store = await JsonStore.open(root, collections, {
      onUnreadable: events.onUnreadable,
      onWrite: events.onWrite,
    });

    const days = new DayRepo(store, clock);
    const threads = new ThreadRepo(store, clock);
    const goals = new GoalRepo(store, clock);
    const plans = new PlanRepo(store);
    const dayRuns = new DayRunRepo(store);
    const sessions = new SessionRepo(store);

    return new Database(
      root,
      store,
      clock,
      threads,
      days,
      goals,
      plans,
      dayRuns,
      sessions,
      settings,
      migration,
    );
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
