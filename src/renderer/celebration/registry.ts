/**
 * THE ONE FILE to touch when adding a pack: add the descriptor here and a folder under
 * packs/. Must mirror src/main/services/CelebrationOrchestrator.ts's PACK_REGISTRY ids exactly
 * — the id is what main sends over IPC to pick which Component renders.
 */
import type { ComponentType } from 'react';
import type { CelebrationPayload } from '@shared/ipc/channels.js';
import { ConfettiBurst } from './packs/ConfettiBurst.js';
import { InkBloom } from './packs/InkBloom.js';
import { Constellation } from './packs/Constellation.js';
import { Rise } from './packs/Rise.js';
import { BossDefeated } from './packs/BossDefeated.js';
import { TickerTape } from './packs/TickerTape.js';

export interface CelebrationPackProps {
  payload: CelebrationPayload;
  onDone: () => void;
}

export interface CelebrationPack {
  id: string;
  name: string;
  tier: 'common' | 'rare';
  durationMs: number;
  reducedMotionSafe: boolean;
  Component: ComponentType<CelebrationPackProps>;
}

export const CELEBRATION_REGISTRY: CelebrationPack[] = [
  { id: 'confetti-burst', name: 'Confetti Burst', tier: 'common', durationMs: 2200, reducedMotionSafe: false, Component: ConfettiBurst },
  { id: 'ink-bloom', name: 'Ink Bloom', tier: 'common', durationMs: 2400, reducedMotionSafe: true, Component: InkBloom },
  { id: 'constellation', name: 'Constellation', tier: 'common', durationMs: 2600, reducedMotionSafe: true, Component: Constellation },
  { id: 'rise', name: 'Rise', tier: 'common', durationMs: 2200, reducedMotionSafe: true, Component: Rise },
  { id: 'boss-defeated', name: 'Boss Defeated', tier: 'rare', durationMs: 3200, reducedMotionSafe: false, Component: BossDefeated },
  { id: 'ticker-tape', name: 'Ticker Tape', tier: 'rare', durationMs: 3400, reducedMotionSafe: true, Component: TickerTape },
];

export function findPack(id: string): CelebrationPack | undefined {
  return CELEBRATION_REGISTRY.find((pack) => pack.id === id);
}
