import { z } from 'zod';
import type { Settings } from '@shared/domain.js';
import {
  DEFAULT_DISTRACTION_GRACE_MS,
  DEFAULT_SESSION_MS,
  DISTRACTION_GRACE_MAX_MS,
  DISTRACTION_GRACE_MIN_MS,
} from '@shared/constants.js';
import { systemTimezone } from '@shared/time.js';

export const settingsSchema: z.ZodType<Settings> = z.object({
  version: z.literal(1),
  defaultSessionMs: z.number().positive(),
  distractionGraceMs: z.number().min(DISTRACTION_GRACE_MIN_MS).max(DISTRACTION_GRACE_MAX_MS),
  soundEnabled: z.boolean(),
  celebrationsEnabled: z.boolean(),
  recentCelebrationIds: z.array(z.string()),
  railCollapsed: z.boolean(),
  hudBounds: z.object({ x: z.number(), y: z.number() }).optional(),
  timezone: z.string(),
  lastOpenSessionId: z.string().optional(),
});

export function defaultSettings(): Settings {
  return {
    version: 1,
    defaultSessionMs: DEFAULT_SESSION_MS,
    distractionGraceMs: DEFAULT_DISTRACTION_GRACE_MS,
    soundEnabled: true,
    celebrationsEnabled: true,
    recentCelebrationIds: [],
    railCollapsed: false,
    timezone: systemTimezone(),
  };
}
