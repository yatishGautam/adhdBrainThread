/**
 * Coach insights: server-authored, pulled only. This repo exists so a handler reads through
 * the same layer everything else does, not because there is anything to write — the tracked
 * queue never sees these, and there is no save method on purpose.
 */
import type { CoachInsight } from '@shared/domain.js';
import { COLLECTION, type Collection, type Store } from '../Store.js';

export class InsightRepo {
  constructor(private readonly store: Store) {}

  private get insights(): Collection<CoachInsight> {
    return this.store.collection<CoachInsight>(COLLECTION.insights);
  }

  async get(periodKey: string): Promise<CoachInsight | null> {
    const insight = await this.insights.get(periodKey);
    return insight && !insight.deletedAt ? insight : null;
  }
}
