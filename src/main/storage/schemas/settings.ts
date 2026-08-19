import { z } from 'zod';
import type { Settings } from '@shared/domain.js';
import {
  DEFAULT_DISTRACTION_GRACE_MS,
  DEFAULT_SESSION_MS,
  DISTRACTION_GRACE_MAX_MS,
  DISTRACTION_GRACE_MIN_MS,
  PLANNER_DEFAULT_MODEL,
} from '@shared/constants.js';
import { systemTimezone } from '@shared/time.js';

/**
 * The planner fields carry `.default()` rather than being optional, so a `settings.json`
 * written before the planner existed parses and gains them in place. The alternative — required
 * fields with no default — would fail the parse and drop the user back to defaults, silently
 * losing their HUD position and session length to add a feature they had not asked for yet.
 */
export const settingsSchema = z.object({
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
  wakeTime: clockTime().default('07:30'),
  dayStartTime: clockTime().default('09:00'),
  dayEndTime: clockTime().default('18:00'),
  plannerContext: z.string().default(''),
  plannerModel: z.string().default(PLANNER_DEFAULT_MODEL),
  plannerEffort: z.enum(['low', 'medium', 'high']).default('medium'),
}) satisfies z.ZodType<Settings, unknown>;

function clockTime(): z.ZodString {
  return z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected a 24-hour HH:MM time');
}

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
    wakeTime: '07:30',
    dayStartTime: '09:00',
    dayEndTime: '18:00',
    plannerContext: '',
    plannerModel: PLANNER_DEFAULT_MODEL,
    // `medium` plans a day as well as `high` does and spends a fraction of the thinking tokens.
    plannerEffort: 'medium',
  };
}
