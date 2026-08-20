/**
 * Day runs: one small record per day actually run.
 *
 * Everything interesting about a run is derived — which block is "now" falls out of the plan,
 * the shift and the clock (`@shared/dayRun.ts`) — so this repo stores only what cannot be:
 * when the day was ignited, how far it has slid, what was let go, when it closed. All writes
 * go through the tracked collection; a run belongs to the account, not the device, and the
 * phone's lock screen derives its nudges from the same record.
 */
import type { DayRun } from '@shared/domain.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';

export class DayRunRepo {
  constructor(private readonly store: Store) {}

  private get runs(): Collection<DayRun> {
    return this.store.collection<DayRun>(COLLECTION.dayRuns);
  }

  async get(localDate: string): Promise<DayRun | null> {
    const run = await this.runs.get(localDate);
    return run && !run.deletedAt ? run : null;
  }

  /**
   * Ignite the day — or resume it. One run per day is the invariant, so pressing Start again
   * after an End reopens the same record rather than pretending the morning did not happen.
   */
  async start(localDate: string): Promise<DayRun> {
    const now = new Date().toISOString();
    const existing = await this.get(localDate);
    const run: DayRun = existing
      ? { ...existing, endedAt: null, updatedAt: now }
      : {
          localDate,
          startedAt: now,
          endedAt: null,
          shiftMs: 0,
          skippedBlockIds: [],
          updatedAt: now,
        };
    await this.runs.put(run);
    return run;
  }

  async save(run: DayRun): Promise<DayRun> {
    await this.runs.put(run);
    return run;
  }

  /** Let one block go, on purpose. Skipping is a decision and reads as one — never "missed". */
  async skip(localDate: string, blockId: string): Promise<DayRun> {
    const run = await this.get(localDate);
    if (!run) throw new Error('The day has not been started.');
    if (run.skippedBlockIds.includes(blockId)) return run;
    return this.save({
      ...run,
      skippedBlockIds: [...run.skippedBlockIds, blockId],
      updatedAt: new Date().toISOString(),
    });
  }

  async end(localDate: string): Promise<DayRun | null> {
    const run = await this.get(localDate);
    if (!run) return null;
    const now = new Date().toISOString();
    return this.save({ ...run, endedAt: now, updatedAt: now });
  }
}
