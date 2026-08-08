/**
 * Everything above this line is storage; everything below it is features. Features call
 * repositories, never ShardedStore — which is what keeps JSON swappable if it ever stops being
 * the right call.
 */
import { collections } from './collections.js';
import { systemClock, type Clock } from './clock.js';
import { ShardedStore, type InitReport } from './ShardedStore.js';
import { DayRepo } from './repositories/dayRepo.js';
import { SessionRepo } from './repositories/sessionRepo.js';
import { SettingsRepo } from './repositories/settingsRepo.js';
import { ThreadRepo } from './repositories/threadRepo.js';
import type { StoreEvents } from './types.js';

export interface DatabaseHandles {
  store: ShardedStore;
  clock: Clock;
  threads: ThreadRepo;
  days: DayRepo;
  sessions: SessionRepo;
  settings: SettingsRepo;
}

export class Database implements DatabaseHandles {
  private constructor(
    readonly root: string,
    readonly store: ShardedStore,
    readonly clock: Clock,
    readonly threads: ThreadRepo,
    readonly days: DayRepo,
    readonly sessions: SessionRepo,
    readonly settings: SettingsRepo,
    readonly initReport: InitReport,
  ) {}

  static async open(root: string, events?: StoreEvents): Promise<Database> {
    const settings = new SettingsRepo(root);
    await settings.load();
    const clock = systemClock(() => settings.get().timezone);

    const store = new ShardedStore({ root, collections, events });
    const initReport = await store.init();

    const days = new DayRepo(store, clock, root);
    await days.load();
    const threads = new ThreadRepo(store, clock);
    const sessions = new SessionRepo(store);

    return new Database(root, store, clock, threads, days, sessions, settings, initReport);
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
