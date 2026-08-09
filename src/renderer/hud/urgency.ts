/**
 * Time-pressure tiers for the HUD, by fraction of planned time remaining rather than absolute
 * ms — a 5-minute and a 90-minute session should both start feeling urgent at the same relative
 * point, not the same number of minutes from zero.
 *
 * The base design principle ("the HUD is deliberately still while a session runs") holds for
 * 'calm' and 'building'. 'urgent' is the one deliberate exception: an ADHD brain needs a
 * felt sense of the clock closing in, not just a number changing. No red is used anywhere —
 * urgency is carried by color intensity and a slow pulse, never an alarm.
 */
export type Urgency = 'calm' | 'building' | 'urgent';

export function computeUrgency(progress: number): Urgency {
  const remainingFraction = 1 - Math.max(0, Math.min(1, progress));
  if (remainingFraction <= 0.15) return 'urgent';
  if (remainingFraction <= 0.4) return 'building';
  return 'calm';
}

export function urgencyColor(urgency: Urgency): string {
  if (urgency === 'calm') return 'var(--amber)';
  return 'var(--amber-bright)';
}
