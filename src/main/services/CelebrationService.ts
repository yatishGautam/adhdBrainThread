/**
 * Pack selection (§7.3). Weighted random over the common tier, with a 5% roll into rare — the
 * variable reward is the entire point, because a predictable payoff stops registering.
 */
import {
  CELEBRATION_ANTI_REPEAT,
  MILESTONE_STEP_COUNT,
  RARE_ROLL_CHANCE,
} from '@shared/constants.js';

export interface PackDescriptor {
  id: string;
  weight: number;
  tier: 'common' | 'rare';
  reducedMotionSafe: boolean;
}

export interface SelectionContext {
  recentIds: string[];
  reducedMotion: boolean;
  /** Force a rare pack: a rolling personal best, or a thread with 10+ steps. */
  milestone: boolean;
  random?: () => number;
}

export function isMilestone(steps: number, personalBest: boolean): boolean {
  return personalBest || steps >= MILESTONE_STEP_COUNT;
}

function weightedPick(packs: PackDescriptor[], random: () => number): PackDescriptor | null {
  const total = packs.reduce((sum, pack) => sum + pack.weight, 0);
  if (total <= 0) return packs[0] ?? null;
  let roll = random() * total;
  for (const pack of packs) {
    roll -= pack.weight;
    if (roll <= 0) return pack;
  }
  return packs[packs.length - 1] ?? null;
}

export function selectPack(
  registry: PackDescriptor[],
  context: SelectionContext,
): PackDescriptor | null {
  const random = context.random ?? Math.random;
  // Reduced motion restricts the pool to packs that fade rather than move.
  const eligible = context.reducedMotion
    ? registry.filter((pack) => pack.reducedMotionSafe)
    : registry;
  if (eligible.length === 0) return null;

  const rare = eligible.filter((pack) => pack.tier === 'rare');
  if ((context.milestone || random() < RARE_ROLL_CHANCE) && rare.length > 0) {
    return weightedPick(rare, random);
  }

  const common = eligible.filter((pack) => pack.tier === 'common');
  const pool = common.filter((pack) => !context.recentIds.includes(pack.id));
  // Anti-repeat must never empty the pool — falling back beats showing nothing.
  return weightedPick(pool.length > 0 ? pool : common, random);
}

export function rememberPack(recentIds: string[], packId: string): string[] {
  return [packId, ...recentIds.filter((id) => id !== packId)].slice(0, CELEBRATION_ANTI_REPEAT);
}
