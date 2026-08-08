import { z } from 'zod';

/**
 * Timestamps are validated by shape rather than with `z.string().datetime()` so that a
 * hand-edited file with a slightly different but still parseable ISO string is repaired by the
 * user, not quarantined by us.
 */
export const isoTimestamp = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), 'expected an ISO-8601 timestamp');

export const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

export const ulidLike = z.string().min(1);

export type Infer<T extends z.ZodType> = z.infer<T>;
