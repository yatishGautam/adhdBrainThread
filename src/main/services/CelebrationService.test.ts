import { describe, expect, it } from 'vitest';
import { CELEBRATION_ANTI_REPEAT } from '@shared/constants.js';
import { isMilestone, rememberPack, selectPack, type PackDescriptor } from './CelebrationService.js';

const registry: PackDescriptor[] = [
  { id: 'confetti', weight: 3, tier: 'common', reducedMotionSafe: false },
  { id: 'ink', weight: 2, tier: 'common', reducedMotionSafe: true },
  { id: 'constellation', weight: 2, tier: 'common', reducedMotionSafe: true },
  { id: 'rise', weight: 1, tier: 'common', reducedMotionSafe: true },
  { id: 'boss', weight: 1, tier: 'rare', reducedMotionSafe: false },
  { id: 'ticker', weight: 1, tier: 'rare', reducedMotionSafe: true },
];

const base = { recentIds: [], reducedMotion: false, milestone: false };

describe('pack selection', () => {
  it('excludes the last two ids from the common pool', () => {
    const picks = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      const pack = selectPack(registry, { ...base, recentIds: ['confetti', 'ink'], random: Math.random });
      if (pack && pack.tier === 'common') picks.add(pack.id);
    }
    expect(picks.has('confetti')).toBe(false);
    expect(picks.has('ink')).toBe(false);
  });

  it('falls back to the full common pool rather than returning nothing', () => {
    const twoCommon: PackDescriptor[] = registry.filter((p) => p.id === 'confetti' || p.id === 'ink');
    const pack = selectPack(twoCommon, { ...base, recentIds: ['confetti', 'ink'], random: () => 0.9 });
    expect(pack).not.toBeNull();
  });

  it('forces a rare pack on a milestone', () => {
    const pack = selectPack(registry, { ...base, milestone: true, random: () => 0.99 });
    expect(pack?.tier).toBe('rare');
  });

  it('rolls rare roughly 5% of the time', () => {
    let rare = 0;
    for (let i = 0; i < 4000; i += 1) {
      if (selectPack(registry, { ...base })?.tier === 'rare') rare += 1;
    }
    expect(rare / 4000).toBeGreaterThan(0.02);
    expect(rare / 4000).toBeLessThan(0.09);
  });

  it('only offers reduced-motion-safe packs when the OS asks for reduced motion', () => {
    for (let i = 0; i < 200; i += 1) {
      const pack = selectPack(registry, { ...base, reducedMotion: true });
      expect(pack && registry.find((p) => p.id === pack.id)?.reducedMotionSafe).toBe(true);
    }
  });

  it('returns null rather than throwing on an empty registry', () => {
    expect(selectPack([], base)).toBeNull();
  });
});

describe('anti-repeat memory', () => {
  it('keeps only the configured number of ids, most recent first', () => {
    let recent: string[] = [];
    for (const id of ['a', 'b', 'c']) recent = rememberPack(recent, id);
    expect(recent).toEqual(['c', 'b'].slice(0, CELEBRATION_ANTI_REPEAT));
  });

  it('does not duplicate an id that repeats', () => {
    expect(rememberPack(['a', 'b'], 'a')).toEqual(['a', 'b']);
  });
});

describe('milestones', () => {
  it('counts a personal best or a ten-step thread', () => {
    expect(isMilestone(2, true)).toBe(true);
    expect(isMilestone(10, false)).toBe(true);
    expect(isMilestone(3, false)).toBe(false);
  });
});
