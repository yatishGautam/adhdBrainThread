/**
 * Wires pack selection (pure, in CelebrationService.ts) to the overlay window and to Settings'
 * anti-repeat memory. This is the "one file to touch" on the main-process side; the renderer's
 * registry.ts is the other.
 */
import type { Thread } from '@shared/domain.js';
import type { CelebrationCue, CelebrationPayload } from '@shared/ipc/channels.js';
import type { Database } from '../storage/Database.js';
import type { CelebrationOverlay } from '../windows/celebrationWindow.js';
import { isMilestone, rememberPack, selectPack, type PackDescriptor } from './CelebrationService.js';
import type { ScopeSummary } from '@shared/analytics.js';

/**
 * Mirrors src/renderer/celebration/registry.ts. Kept in sync by hand — both sides list the same
 * six packs, but only the renderer needs the React components.
 */
export const PACK_REGISTRY: PackDescriptor[] = [
  { id: 'confetti-burst', weight: 4, tier: 'common', reducedMotionSafe: false },
  { id: 'ink-bloom', weight: 3, tier: 'common', reducedMotionSafe: true },
  { id: 'constellation', weight: 3, tier: 'common', reducedMotionSafe: true },
  { id: 'rise', weight: 2, tier: 'common', reducedMotionSafe: true },
  { id: 'boss-defeated', weight: 2, tier: 'rare', reducedMotionSafe: false },
  { id: 'ticker-tape', weight: 1, tier: 'rare', reducedMotionSafe: true },
];

export class CelebrationOrchestrator {
  constructor(
    private readonly db: Database,
    private readonly overlay: CelebrationOverlay,
    private readonly getMomentum: () => Promise<ScopeSummary>,
    private readonly getReducedMotion: () => boolean,
  ) {}

  async celebrate(thread: Thread): Promise<void> {
    if (!this.db.settings.get().celebrationsEnabled) return;

    const scope = await this.getMomentum();
    const personalBest = scope.insight.kind === 'personal_best';
    const settings = this.db.settings.get();

    const pack = selectPack(PACK_REGISTRY, {
      recentIds: settings.recentCelebrationIds,
      reducedMotion: this.getReducedMotion(),
      milestone: isMilestone(thread.steps.length, personalBest),
    });
    if (!pack) return;

    await this.db.settings.update({
      recentCelebrationIds: rememberPack(settings.recentCelebrationIds, pack.id),
    });

    const payload: CelebrationPayload = {
      threadTitle: thread.title,
      steps: thread.steps.filter((step) => step.done).length,
      focusMs: thread.totalFocusMs,
      sessionCount: thread.sessionCount,
      momentum: scope.momentum,
      band: scope.band.label,
    };
    const cue: CelebrationCue = {
      packId: pack.id,
      payload,
      reducedMotion: this.getReducedMotion(),
      soundEnabled: settings.soundEnabled,
    };
    this.overlay.play(cue);
  }

  stop(): void {
    this.overlay.stop();
  }
}
