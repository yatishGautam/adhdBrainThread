/** Formatting shared by main (insight copy) and every renderer. */

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** "1h 20m" / "45m" / "2m". Never "0h 0m". */
export function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

export function formatCount(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parts(localDate: string): { year: number; month: number; day: number; weekday: number } {
  const [year, month, day] = localDate.split('-').map(Number) as [number, number, number];
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
}

export function formatLocalDate(localDate: string): string {
  const { month, day, weekday } = parts(localDate);
  return `${WEEKDAYS[weekday]?.slice(0, 3)} ${day} ${MONTHS[month - 1]?.slice(0, 3)}`;
}

export function formatLongDate(localDate: string): string {
  const { year, month, day, weekday } = parts(localDate);
  return `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month - 1]} ${year}`;
}

export function formatMonth(localDate: string): string {
  const { year, month } = parts(localDate);
  return `${MONTHS[month - 1]} ${year}`;
}

export function formatDayNumber(localDate: string): string {
  return String(parts(localDate).day);
}

export function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
