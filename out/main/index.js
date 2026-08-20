import { safeStorage, BrowserWindow, screen, app, nativeImage, shell, Tray, Menu, nativeTheme, Notification, ipcMain, powerMonitor } from "electron";
import { toZonedTime, format } from "date-fns-tz";
import { z } from "zod";
import { promises } from "node:fs";
import path from "node:path";
import "node:crypto";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
function formatClock(ms) {
  const total = Math.max(0, Math.round(ms / 1e3));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
function formatTrayCountdown(ms) {
  return `${Math.ceil(Math.max(0, ms) / 6e4)}m`;
}
function formatDuration(ms) {
  const minutes = Math.round(ms / 6e4);
  if (minutes < 1) return "under a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}
const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
function parts(localDate2) {
  const [year, month, day] = localDate2.split("-").map(Number);
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  };
}
function formatLocalDate(localDate2) {
  const { month, day, weekday } = parts(localDate2);
  return `${WEEKDAYS[weekday]?.slice(0, 3)} ${day} ${MONTHS[month - 1]?.slice(0, 3)}`;
}
function formatMonth(localDate2) {
  const { year, month } = parts(localDate2);
  return `${MONTHS[month - 1]} ${year}`;
}
function systemTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
function localDateOf$1(instant, timezone) {
  const date2 = typeof instant === "string" ? new Date(instant) : instant;
  return format(toZonedTime(date2, timezone), "yyyy-MM-dd", { timeZone: timezone });
}
function localHourOf(instant, timezone) {
  const date2 = typeof instant === "string" ? new Date(instant) : instant;
  return toZonedTime(date2, timezone).getHours();
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function addLocalDays(localDate2, days) {
  const [y, m, d] = localDate2.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
function localDateRange(from, to) {
  const out = [];
  for (let cursor = from; cursor <= to; cursor = addLocalDays(cursor, 1)) out.push(cursor);
  return out;
}
function diffLocalDays(from, to) {
  const parse = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 864e5);
}
function startOfLocalWeek(localDate2) {
  const [y, m, d] = localDate2.split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  const shift2 = (utc.getUTCDay() + 6) % 7;
  return addLocalDays(localDate2, -shift2);
}
function startOfLocalMonth(localDate2) {
  return `${localDate2.slice(0, 7)}-01`;
}
function endOfLocalMonth(localDate2) {
  const [y, m] = localDate2.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${localDate2.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}
const WEEK_KEY_PATTERN = /^(\d{4})-W(\d{2})$/;
function weekKeyOf(localDate2) {
  const monday = startOfLocalWeek(localDate2);
  const thursday = addLocalDays(monday, 3);
  const [y, m, d] = thursday.split("-").map(Number);
  const thursdayUtc = new Date(Date.UTC(y, m - 1, d));
  const year = thursdayUtc.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursdayUtc.getTime() - jan1) / (7 * 864e5)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
function weekStart(key) {
  const match = WEEK_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`not a week key: ${key}`);
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = `${year}-01-04`;
  return addLocalDays(startOfLocalWeek(jan4), (week - 1) * 7);
}
function weekDates(key) {
  const monday = weekStart(key);
  return Array.from({ length: 7 }, (_, i) => addLocalDays(monday, i));
}
function remainingWeekDates(localDate2) {
  return weekDates(weekKeyOf(localDate2)).filter((date2) => date2 >= localDate2);
}
const isoTimestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "expected an ISO-8601 timestamp");
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const ulidLike = z.string().min(1);
const todoSchema = z.object({
  id: ulidLike,
  text: z.string(),
  done: z.boolean(),
  localDate,
  createdAt: isoTimestamp,
  completedAt: isoTimestamp.optional(),
  promotedToThreadId: ulidLike.optional(),
  order: z.number()
});
const thoughtSchema = z.object({
  id: ulidLike,
  text: z.string(),
  createdAt: isoTimestamp,
  localDate,
  processed: z.boolean(),
  note: z.string().optional()
});
const blockerSchema = z.object({
  id: ulidLike,
  text: z.string(),
  resolved: z.boolean(),
  localDate,
  createdAt: isoTimestamp,
  resolvedAt: isoTimestamp.optional()
});
const logEntrySchema = z.object({
  id: ulidLike,
  text: z.string(),
  at: isoTimestamp,
  localDate,
  source: z.enum(["manual", "todo", "focus", "thread"])
});
const daySchema = z.object({
  localDate,
  createdAt: isoTimestamp,
  intentThreadIds: z.array(ulidLike),
  todos: z.array(todoSchema),
  thoughts: z.array(thoughtSchema),
  loggedThreadIds: z.array(ulidLike),
  note: z.string().optional(),
  // Optional throughout: day files written before these fields existed must keep parsing.
  now: z.string().optional(),
  blockers: z.array(blockerSchema).optional(),
  log: z.array(logEntrySchema).optional(),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish()
});
const weekKey = z.string().regex(/^\d{4}-W\d{2}$/, "expected an ISO week key like 2026-W34");
const goalSchema = z.object({
  id: ulidLike,
  title: z.string(),
  done: z.boolean(),
  // Never optional, unlike most late-added fields: goals did not exist before this schema, so
  // there is no file on disk without it and defaulting would only hide a real bug.
  context: z.string(),
  weekKey,
  order: z.number(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  completedAt: isoTimestamp.optional(),
  completedLocalDate: localDate.optional(),
  carriedFromWeek: weekKey.optional(),
  deletedAt: isoTimestamp.nullish()
});
const clockTime$1 = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected a 24-hour HH:MM time");
const planBlockKind = z.enum([
  "focus",
  "break",
  "admin",
  "meal",
  "buffer",
  "wind_down"
]);
const planBlockSchema = z.object({
  // Not `ulidLike`: the server derives block ids from the day and the block's position
  // (`20260820-00`), so they are stable across a regeneration instead of churning every time.
  id: z.string().min(1),
  start: clockTime$1,
  end: clockTime$1,
  kind: planBlockKind,
  title: z.string(),
  why: z.string().optional(),
  threadId: ulidLike.optional(),
  todoId: ulidLike.optional(),
  goalId: ulidLike.optional(),
  promoted: z.boolean().optional(),
  pinned: z.boolean().optional()
});
const planUsageSchema = z.object({
  inputTokens: z.number().nonnegative(),
  outputTokens: z.number().nonnegative(),
  costUsd: z.number().nonnegative()
});
const dayPlanSchema = z.object({
  localDate,
  // Optional so plan files written by the old local planner still validate — those predate week
  // plans and have no week to point at. Every plan written since carries it.
  weekKey: weekKey.optional(),
  generatedAt: isoTimestamp,
  wakeTime: clockTime$1,
  startTime: clockTime$1,
  endTime: clockTime$1,
  blocks: z.array(planBlockSchema),
  headline: z.string(),
  // Same reason, and the same three fields that moved to `WeekPlan` when a run started
  // producing several days at once.
  deferred: z.array(z.string()).optional(),
  model: z.string().optional(),
  usage: planUsageSchema.optional(),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish()
});
const weekPlanSchema = z.object({
  weekKey,
  generatedAt: isoTimestamp,
  fromDate: localDate,
  toDate: localDate,
  headline: z.string(),
  deferred: z.array(z.string()),
  model: z.string(),
  usage: planUsageSchema,
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish()
});
const dayRunSchema = z.object({
  localDate,
  startedAt: isoTimestamp,
  endedAt: isoTimestamp.nullish(),
  shiftMs: z.number().int(),
  shiftFrom: clockTime$1.optional(),
  skippedBlockIds: z.array(z.string()),
  updatedAt: isoTimestamp,
  deletedAt: isoTimestamp.nullish()
});
const coachInsightSchema = z.object({
  periodKey: z.string().regex(/^(\d{4}-W\d{2}|\d{4}-\d{2}-\d{2})$/),
  generatedAt: isoTimestamp,
  headline: z.string(),
  body: z.string(),
  suggestion: z.string(),
  model: z.string(),
  usage: planUsageSchema,
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish()
});
const mindfulSessionSchema = z.object({
  id: ulidLike,
  startedAt: isoTimestamp,
  endedAt: isoTimestamp.nullish(),
  localDate,
  plannedMs: z.number().nonnegative(),
  actualMs: z.number().nonnegative(),
  completed: z.boolean(),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish()
});
const distractionSchema = z.object({
  id: ulidLike,
  at: isoTimestamp,
  kind: z.enum(["internal", "external", "unspecified"]),
  note: z.string().optional(),
  grantedMs: z.number().nonnegative()
});
const pauseSchema = z.object({
  at: isoTimestamp,
  resumedAt: isoTimestamp.optional()
});
const sessionSchema = z.object({
  id: ulidLike,
  threadId: ulidLike,
  startedAt: isoTimestamp,
  endedAt: isoTimestamp.optional(),
  localDate,
  plannedMs: z.number().nonnegative(),
  activeMs: z.number().nonnegative(),
  grantedMs: z.number().nonnegative(),
  outcome: z.enum(["completed", "ended_early", "switched", "abandoned", "recovered"]),
  switchedToThreadId: ulidLike.optional(),
  distractions: z.array(distractionSchema),
  pauses: z.array(pauseSchema),
  updatedAt: isoTimestamp.optional(),
  deletedAt: isoTimestamp.nullish()
});
const stepSchema = z.object({
  id: ulidLike,
  text: z.string(),
  done: z.boolean(),
  order: z.number(),
  completedAt: isoTimestamp.optional(),
  completedLocalDate: localDate.optional()
});
const threadSchema = z.object({
  id: ulidLike,
  title: z.string(),
  notes: z.string(),
  // 'idle' is legacy — kept so day-one thread files keep parsing after the Blocked/Dormant split.
  status: z.enum(["idle", "in_progress", "blocked", "waiting", "done", "dormant"]),
  steps: z.array(stepSchema),
  waitingOn: z.string().optional(),
  link: z.string().optional(),
  order: z.number().optional(),
  createdAt: isoTimestamp,
  updatedAt: isoTimestamp,
  completedAt: isoTimestamp.optional(),
  completedLocalDate: localDate.optional(),
  totalFocusMs: z.number().nonnegative(),
  sessionCount: z.number().nonnegative(),
  distractionCount: z.number().nonnegative(),
  archived: z.boolean(),
  deletedAt: isoTimestamp.nullish()
});
const FLUSH_DEBOUNCE_MS = 500;
const ACTIVE_THREAD_CAP = 5;
const DEFAULT_SESSION_MS = 25 * 60 * 1e3;
const DEFAULT_DISTRACTION_GRACE_MS = 120 * 1e3;
const DISTRACTION_GRACE_MIN_MS = 0;
const DISTRACTION_GRACE_MAX_MS = 300 * 1e3;
const SESSION_CHECKPOINT_MS = 5e3;
const HUD_TICK_MS = 1e3;
const BREAK_MS = 5 * 60 * 1e3;
const ORDER_STEP = 1e3;
const ORDER_MIN_GAP = 1;
const DMS_WEIGHTS = {
  sessionStarted: { points: 12, cap: 35 },
  focusMinute: { points: 0.5, cap: 30 },
  stepCompleted: { points: 3, cap: 15 },
  threadCompleted: { points: 10, cap: 20 }
};
const MOMENTUM_ALPHA = { day: 0.15 };
const WEEK_SCORE_LIFT = 1.4;
const CELEBRATION_HARD_TIMEOUT_MS = 6e3;
const RARE_ROLL_CHANCE = 0.05;
const CELEBRATION_ANTI_REPEAT = 2;
const MILESTONE_STEP_COUNT = 10;
const PLANNER_DEFAULT_MODEL = "claude-opus-5";
const PLANNER_MODELS = [
  { id: "claude-opus-5", label: "Opus 5", note: "Best judgement · ~$0.05 a plan" },
  { id: "claude-sonnet-5", label: "Sonnet 5", note: "Balanced · ~$0.03 a plan" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5", note: "Cheapest · ~$0.01 a plan" }
];
let tmpCounter = 0;
async function atomicWriteFile(file, contents) {
  const dir = path.dirname(file);
  await promises.mkdir(dir, { recursive: true });
  tmpCounter = (tmpCounter + 1) % Number.MAX_SAFE_INTEGER;
  const tmp = path.join(dir, `.${path.basename(file)}.tmp-${process.pid}-${Date.now()}-${tmpCounter}`);
  const handle = await promises.open(tmp, "w");
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await promises.rename(tmp, file);
  await syncDirectory(dir);
}
async function syncDirectory(dir) {
  let handle;
  try {
    handle = await promises.open(dir, "r");
    await handle.sync();
  } catch {
  } finally {
    await handle?.close();
  }
}
async function readFileIfExists(file) {
  try {
    return await promises.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
async function pathExists(file) {
  try {
    await promises.access(file);
    return true;
  } catch {
    return false;
  }
}
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const source = value;
    const out = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === void 0) continue;
      out[key] = sortValue(source[key]);
    }
    return out;
  }
  return value;
}
function serialise(value) {
  return `${JSON.stringify(sortValue(value), null, 2)}
`;
}
const COLLECTION = {
  threads: "threads",
  days: "days",
  sessions: "sessions",
  /** Sits. Written only by the sync engine — they are recorded on the phone. */
  mindful: "mindful",
  /**
   * Weekly goals, and the plans generated from them.
   *
   * All three sync like everything else now that the backend has columns for them. Goals are
   * written here and pushed; plans and week plans are written by the *server* and only ever
   * pulled — the one exception being a tombstone, because "I threw this week's plan away" has
   * to reach the other device.
   */
  goals: "goals",
  plans: "plans",
  weekPlans: "weekPlans",
  /** Day runs: "Start my day", the shift, and what was let go. Authored here and on the phone. */
  dayRuns: "dayRuns",
  /** Coach insights. Server-authored, pulled only — never in the push queue. */
  insights: "insights"
};
function defineCollection(spec) {
  return spec;
}
class JsonStore {
  constructor(root, events) {
    this.root = root;
    this.events = events;
  }
  collections = /* @__PURE__ */ new Map();
  flushTimer = null;
  closed = false;
  /** Reads everything into memory once. There is no lazy loading and none is needed. */
  static async open(root, specs, events = {}) {
    const store = new JsonStore(root, events);
    for (const raw of specs) {
      const spec = raw;
      const loaded = { spec, partitions: /* @__PURE__ */ new Map() };
      for (const [name, records] of await store.readCollection(spec)) {
        loaded.partitions.set(name, { records, dirty: false });
      }
      store.collections.set(spec.name, loaded);
    }
    return store;
  }
  collection(name, options = {}) {
    const loaded = this.collections.get(name);
    if (!loaded) throw new Error(`unknown collection: ${name}`);
    const track = options.track !== false;
    return {
      all: async () => this.recordsOf(loaded),
      get: async (key) => this.find(loaded, key) ?? null,
      put: async (record) => this.write(loaded, record, track),
      delete: async (key) => this.remove(loaded, key, track)
    };
  }
  async flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const loaded of this.collections.values()) {
      for (const [name, partition] of loaded.partitions) {
        if (!partition.dirty) continue;
        partition.dirty = false;
        const records = [...partition.records.values()];
        await atomicWriteFile(this.fileFor(loaded.spec, name), serialise(records));
      }
    }
  }
  async close() {
    this.closed = true;
    await this.flush();
  }
  /** One file containing everything, for the export button. */
  async exportTo(target) {
    await this.flush();
    const out = {};
    for (const [name, loaded] of this.collections) {
      out[name] = this.recordsOf(loaded);
    }
    await atomicWriteFile(target, serialise({ exportedAt: (/* @__PURE__ */ new Date()).toISOString(), ...out }));
  }
  /**
   * Re-reads every file from disk, replacing what is in memory. This is the whole of what
   * "repair" now means: there is no index to rebuild and no journal to replay.
   */
  async reload() {
    await this.flush();
    for (const loaded of this.collections.values()) {
      loaded.partitions.clear();
      for (const [name, records] of await this.readCollection(loaded.spec)) {
        loaded.partitions.set(name, { records, dirty: false });
      }
    }
  }
  get fileCount() {
    let total = 0;
    for (const loaded of this.collections.values()) total += loaded.partitions.size;
    return total;
  }
  // ---------------------------------------------------------------- internals
  recordsOf(loaded) {
    const out = [];
    for (const partition of loaded.partitions.values()) out.push(...partition.records.values());
    return out;
  }
  find(loaded, key) {
    for (const partition of loaded.partitions.values()) {
      const found = partition.records.get(key);
      if (found !== void 0) return found;
    }
    return void 0;
  }
  write(loaded, record, track = true) {
    const key = loaded.spec.key(record);
    if (track) this.events.onWrite?.(loaded.spec.name, key);
    const target = loaded.spec.partition?.(record) ?? "";
    for (const [name, partition2] of loaded.partitions) {
      if (name !== target && partition2.records.delete(key)) partition2.dirty = true;
    }
    const partition = this.partitionFor(loaded, target);
    partition.records.set(key, record);
    partition.dirty = true;
    this.scheduleFlush();
  }
  remove(loaded, key, track = true) {
    if (track) this.events.onWrite?.(loaded.spec.name, key);
    for (const partition of loaded.partitions.values()) {
      if (partition.records.delete(key)) partition.dirty = true;
    }
    this.scheduleFlush();
  }
  partitionFor(loaded, name) {
    const existing = loaded.partitions.get(name);
    if (existing) return existing;
    const created = { records: /* @__PURE__ */ new Map(), dirty: true };
    loaded.partitions.set(name, created);
    return created;
  }
  scheduleFlush() {
    if (this.closed || this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush().catch((error) => console.error("[storage] flush failed", error));
    }, FLUSH_DEBOUNCE_MS);
  }
  fileFor(spec, partition) {
    return partition ? path.join(this.root, spec.name, `${partition}.json`) : path.join(this.root, `${spec.name}.json`);
  }
  async readCollection(spec) {
    const out = /* @__PURE__ */ new Map();
    for (const partition of await this.partitionNames(spec)) {
      const records = await this.readFile(spec, this.fileFor(spec, partition));
      if (records) out.set(partition, records);
    }
    return out;
  }
  async partitionNames(spec) {
    if (!spec.partition) return [""];
    try {
      const entries = await promises.readdir(path.join(this.root, spec.name));
      return entries.filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -".json".length));
    } catch {
      return [];
    }
  }
  async readFile(spec, file) {
    const raw = await readFileIfExists(file);
    if (raw === null) return null;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      this.events.onUnreadable?.(file, `not valid JSON: ${error.message}`);
      return null;
    }
    if (!Array.isArray(parsed)) {
      this.events.onUnreadable?.(file, "expected an array of records");
      return null;
    }
    const records = /* @__PURE__ */ new Map();
    let rejected = 0;
    for (const candidate of parsed) {
      const result = spec.schema.safeParse(candidate);
      if (!result.success) {
        rejected += 1;
        continue;
      }
      records.set(spec.key(result.data), result.data);
    }
    if (rejected > 0) {
      this.events.onUnreadable?.(file, `${rejected} record(s) did not match the schema`);
    }
    return records;
  }
}
function monthOf(localDate2) {
  return localDate2.slice(0, 7);
}
const collections = [
  defineCollection({
    name: COLLECTION.threads,
    schema: threadSchema,
    key: (thread) => thread.id
  }),
  defineCollection({
    name: COLLECTION.days,
    schema: daySchema,
    key: (day) => day.localDate,
    partition: (day) => monthOf(day.localDate)
  }),
  defineCollection({
    name: COLLECTION.sessions,
    schema: sessionSchema,
    key: (session) => session.id,
    // Bucketed by the local date already stamped on the record at write time, never re-derived
    // from the UTC timestamp — that is how sessions land on the wrong side of a DST boundary.
    partition: (session) => monthOf(session.localDate)
  }),
  defineCollection({
    name: COLLECTION.mindful,
    schema: mindfulSessionSchema,
    key: (sit) => sit.id,
    partition: (sit) => monthOf(sit.localDate)
  }),
  // A year of goals is a few hundred records at most, so one file per ISO week-numbering year
  // keeps `goals/2026.json` small enough to open and read by hand.
  defineCollection({
    name: COLLECTION.goals,
    schema: goalSchema,
    key: (goal) => goal.id,
    partition: (goal) => goal.weekKey.slice(0, 4)
  }),
  // Keyed by the day it plans, so regenerating replaces rather than accumulates.
  defineCollection({
    name: COLLECTION.plans,
    schema: dayPlanSchema,
    key: (plan) => plan.localDate,
    partition: (plan) => monthOf(plan.localDate)
  }),
  // One tiny record per day actually run. Month files, like the plans they point into.
  defineCollection({
    name: COLLECTION.dayRuns,
    schema: dayRunSchema,
    key: (run) => run.localDate,
    partition: (run) => monthOf(run.localDate)
  }),
  // A couple of hundred a year at the very most; a file per year, keyed by period.
  defineCollection({
    name: COLLECTION.insights,
    schema: coachInsightSchema,
    key: (insight) => insight.periodKey,
    partition: (insight) => insight.periodKey.slice(0, 4)
  }),
  // One record per press of the button. Fifty-two a year at most, so a file per ISO
  // week-numbering year — the same partition the goals use, and for the same reason.
  defineCollection({
    name: COLLECTION.weekPlans,
    schema: weekPlanSchema,
    key: (plan) => plan.weekKey,
    partition: (plan) => plan.weekKey.slice(0, 4)
  })
];
function systemClock(timezone = systemTimezone) {
  return {
    now: nowIso,
    timezone,
    today: () => localDateOf$1(/* @__PURE__ */ new Date(), timezone()),
    localDateOf: (instant) => localDateOf$1(instant, timezone())
  };
}
const BACKUP_DIR = ".old-storage";
async function needsMigration(root) {
  if (await pathExists(path.join(root, BACKUP_DIR))) return false;
  return pathExists(path.join(root, "manifest.json"));
}
async function migrate(root) {
  if (!await needsMigration(root)) {
    return { migrated: false, threads: 0, days: 0, sessions: 0 };
  }
  const threads = [
    ...await readShard(path.join(root, "threads", "active.json")),
    ...await readShardsIn(path.join(root, "threads", "archive"))
  ];
  const days = await readShardsIn(path.join(root, "days"));
  const sessions = await readShardsIn(path.join(root, "sessions"));
  await atomicWriteFile(path.join(root, "threads.json"), serialise(threads));
  await writePartitioned(path.join(root, "days"), days, (day) => localDateOf(day).slice(0, 7));
  await writePartitioned(
    path.join(root, "sessions"),
    sessions,
    (s) => localDateOf(s).slice(0, 7)
  );
  const backup = path.join(root, BACKUP_DIR);
  await promises.mkdir(backup, { recursive: true });
  for (const stale of ["manifest.json", "journal.jsonl"]) {
    await move(path.join(root, stale), path.join(backup, stale));
  }
  await move(path.join(root, "threads"), path.join(backup, "threads"));
  await moveOldShards(path.join(root, "days"), path.join(backup, "days"));
  await moveOldShards(path.join(root, "sessions"), path.join(backup, "sessions"));
  return {
    migrated: true,
    threads: threads.length,
    days: days.length,
    sessions: sessions.length,
    backupDir: backup
  };
}
function localDateOf(record) {
  const value = record.localDate;
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "0000-00-00";
}
async function readShard(file) {
  const raw = await readFileIfExists(file);
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    const records = parsed.records;
    return Array.isArray(records) ? records : [];
  } catch {
    console.warn("[migrate] could not read", file);
    return [];
  }
}
async function readShardsIn(dir) {
  let entries;
  try {
    entries = await promises.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".json") || entry === "index.json") continue;
    out.push(...await readShard(path.join(dir, entry)));
  }
  return out;
}
async function writePartitioned(dir, records, partition) {
  const groups = /* @__PURE__ */ new Map();
  for (const record of records) {
    const key = partition(record);
    const list = groups.get(key);
    if (list) list.push(record);
    else groups.set(key, [record]);
  }
  for (const [key, list] of groups) {
    await atomicWriteFile(path.join(dir, `${key}.json`), serialise(list));
  }
}
async function move(from, to) {
  try {
    await promises.rename(from, to);
  } catch {
  }
}
async function moveOldShards(dir, backup) {
  let entries;
  try {
    entries = await promises.readdir(dir);
  } catch {
    return;
  }
  await promises.mkdir(backup, { recursive: true });
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    if (/^\d{4}-\d{2}\.json$/.test(entry)) continue;
    await move(path.join(dir, entry), path.join(backup, entry));
  }
}
const ENCODING = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RANDOM_LEN = 16;
let lastTime = -1;
let lastRandom = [];
function randomChars() {
  const bytes = new Uint8Array(RANDOM_LEN);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b % ENCODING.length);
}
function bumpRandom(chars) {
  const next = chars.slice();
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const value = next[i] ?? 0;
    if (value < ENCODING.length - 1) {
      next[i] = value + 1;
      return next;
    }
    next[i] = 0;
  }
  return randomChars();
}
function encodeTime(time) {
  let out = "";
  let remaining = time;
  for (let i = 0; i < TIME_LEN; i += 1) {
    out = ENCODING[remaining % ENCODING.length] + out;
    remaining = Math.floor(remaining / ENCODING.length);
  }
  return out;
}
function ulid(now = Date.now()) {
  if (now === lastTime) {
    lastRandom = bumpRandom(lastRandom);
  } else {
    lastTime = now;
    lastRandom = randomChars();
  }
  return encodeTime(now) + lastRandom.map((i) => ENCODING[i]).join("");
}
function sortByOrder(items) {
  return [...items].sort((a, b) => a.order - b.order);
}
function nextOrder(items) {
  return items.reduce((max, item) => Math.max(max, item.order), 0) + ORDER_STEP;
}
function orderAfter(items, afterId) {
  const sorted = sortByOrder(items);
  const index = sorted.findIndex((item) => item.id === afterId);
  const before = index === -1 ? void 0 : sorted[index];
  if (!before) return nextOrder(items);
  const after = sorted[index + 1];
  return after ? midpoint(before.order, after.order) : before.order + ORDER_STEP;
}
function midpoint(low, high) {
  return low + (high - low) / 2;
}
function reorder(items, id, toIndex) {
  const sorted = sortByOrder(items);
  const moving = sorted.find((item) => item.id === id);
  if (!moving) return { items: sorted, renumbered: false };
  const without = sorted.filter((item) => item.id !== id);
  const target = Math.max(0, Math.min(toIndex, without.length));
  const before = without[target - 1];
  const after = without[target];
  let order;
  if (!before && !after) order = ORDER_STEP;
  else if (!before) order = after.order - ORDER_STEP;
  else if (!after) order = before.order + ORDER_STEP;
  else order = midpoint(before.order, after.order);
  const next = sortByOrder([...without, { ...moving, order }]);
  return needsRenumber(next) ? { items: renumber(next), renumbered: true } : { items: next, renumbered: false };
}
function needsRenumber(items) {
  for (let i = 1; i < items.length; i += 1) {
    const previous = items[i - 1];
    const current = items[i];
    if (previous && current && current.order - previous.order < ORDER_MIN_GAP) return true;
  }
  return false;
}
function renumber(items) {
  return sortByOrder(items).map((item, index) => ({ ...item, order: (index + 1) * ORDER_STEP }));
}
function nextAction(steps) {
  return sortByOrder(steps).find((step) => !step.done) ?? null;
}
class DayRepo {
  constructor(store, clock) {
    this.store = store;
    this.clock = clock;
  }
  get days() {
    return this.store.collection(COLLECTION.days);
  }
  /**
   * Dates that exist, for the sidebar. This used to be a hand-maintained `days/index.json` so
   * the navigator would not have to load day shards; every day is already in memory now, so
   * that index was a second source of truth for something free to derive.
   */
  async listDates() {
    const all = await this.live();
    return all.map((day) => day.localDate).sort();
  }
  /** Not deleted. See `ThreadRepo.live` for why tombstones stay on disk. */
  async live() {
    return (await this.days.all()).filter((day) => !day.deletedAt);
  }
  /**
   * Days that exist between two local dates, inclusive, in order. Missing days stay missing
   * rather than being materialised as blanks — the planner reading "nothing on Sunday" and the
   * navigator showing no Sunday have to agree.
   */
  async range(from, to) {
    const all = await this.live();
    return all.filter((day) => day.localDate >= from && day.localDate <= to).sort((a, b) => a.localDate.localeCompare(b.localDate));
  }
  async get(localDate2) {
    const day = await this.days.get(localDate2);
    return day && !day.deletedAt ? day : null;
  }
  /** Read-only peek at today. Returns null when today has not happened yet. */
  async today() {
    return this.get(this.clock.today());
  }
  /**
   * The only path that brings a day into existence — and any real interaction can do it. A day
   * becomes real because you wrote a to-do, a reminder, a log line or a note on it. Threads
   * have nothing to do with it: plenty of days are only a couple of errands.
   */
  async ensure(localDate2) {
    const date2 = localDate2 ?? this.clock.today();
    const existing = await this.get(date2);
    if (existing) return existing;
    const day = {
      localDate: date2,
      createdAt: this.clock.now(),
      intentThreadIds: [],
      todos: [],
      thoughts: [],
      loggedThreadIds: []
    };
    await this.write(day);
    return day;
  }
  async ensureToday() {
    return this.ensure();
  }
  /**
   * The one write path, which is why `updatedAt` is stamped here — it is when the *user*
   * changed the day, and it is the whole conflict rule.
   */
  async write(day) {
    const next = { ...day, updatedAt: this.clock.now() };
    await this.days.put(next);
    return next;
  }
  async mutateToday(change) {
    return this.mutateDay(void 0, change);
  }
  /** Mutates a given day, creating it if it does not exist yet. Defaults to today. */
  async mutateDay(localDate2, change) {
    return this.write(change(await this.ensure(localDate2)));
  }
  async mutate(localDate2, change) {
    const day = await this.get(localDate2);
    if (!day) throw new Error(`day not found: ${localDate2}`);
    return this.write(change(day));
  }
  // ------------------------------------------------------------------ todos
  async addTodo(text, localDate2) {
    return this.mutateDay(localDate2, (day) => {
      const todo = {
        id: ulid(),
        text: text.trim(),
        done: false,
        localDate: day.localDate,
        createdAt: this.clock.now(),
        order: nextOrder(day.todos)
      };
      return { ...day, todos: [...day.todos, todo] };
    });
  }
  async toggleTodo(localDate2, todoId) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      todos: day.todos.map((todo) => {
        if (todo.id !== todoId) return todo;
        if (todo.done) {
          const { completedAt: _done, ...rest } = todo;
          return { ...rest, done: false };
        }
        return { ...todo, done: true, completedAt: this.clock.now() };
      })
    }));
  }
  async updateTodo(localDate2, todoId, text) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      todos: day.todos.map((todo) => todo.id === todoId ? { ...todo, text } : todo)
    }));
  }
  async removeTodo(localDate2, todoId) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      todos: day.todos.filter((todo) => todo.id !== todoId)
    }));
  }
  async reorderTodo(localDate2, todoId, toIndex) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      todos: reorder(day.todos, todoId, toIndex).items
    }));
  }
  /** The todo is never deleted, only linked — the history stays honest. */
  async linkPromotedTodo(localDate2, todoId, threadId) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      todos: day.todos.map(
        (todo) => todo.id === todoId ? { ...todo, promotedToThreadId: threadId } : todo
      )
    }));
  }
  // --------------------------------------------------------------- blockers
  async addBlocker(text, localDate2) {
    return this.mutateDay(localDate2, (day) => {
      const blocker = {
        id: ulid(),
        text: text.trim(),
        resolved: false,
        localDate: day.localDate,
        createdAt: this.clock.now()
      };
      return { ...day, blockers: [...day.blockers ?? [], blocker] };
    });
  }
  /** Resolving drops it off every daily page. The record stays — the history stays honest. */
  async resolveBlocker(localDate2, blockerId) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      blockers: (day.blockers ?? []).map((blocker) => {
        if (blocker.id !== blockerId) return blocker;
        if (blocker.resolved) {
          const { resolvedAt: _was, ...rest } = blocker;
          return { ...rest, resolved: false };
        }
        return { ...blocker, resolved: true, resolvedAt: this.clock.now() };
      })
    }));
  }
  async removeBlocker(localDate2, blockerId) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      blockers: (day.blockers ?? []).filter((blocker) => blocker.id !== blockerId)
    }));
  }
  async findBlocker(localDate2, blockerId) {
    const day = await this.get(localDate2);
    return day?.blockers?.find((blocker) => blocker.id === blockerId) ?? null;
  }
  // -------------------------------------------------------------------- log
  async addLogEntry(text, source = "manual", localDate2) {
    return this.mutateDay(localDate2, (day) => {
      const entry = {
        id: ulid(),
        text: text.trim(),
        at: this.clock.now(),
        localDate: day.localDate,
        source
      };
      return { ...day, log: [...day.log ?? [], entry] };
    });
  }
  async removeLogEntry(localDate2, entryId) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      log: (day.log ?? []).filter((entry) => entry.id !== entryId)
    }));
  }
  // ------------------------------------------------------ global carry-forward
  /**
   * To-dos and blockers are global (§5): they live on the day that raised them, but every daily
   * page reads all of them until they are completed or resolved. Every day is already in
   * memory, so a scan is cheaper than maintaining a second place for these to live.
   */
  async carryForward() {
    const all = await this.live();
    const todos = [];
    const blockers = [];
    for (const day of all) {
      for (const todo of day.todos) {
        if (!todo.done && !todo.promotedToThreadId) todos.push(todo);
      }
      for (const blocker of day.blockers ?? []) {
        if (!blocker.resolved) blockers.push(blocker);
      }
    }
    todos.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    blockers.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return { todos, blockers };
  }
  // --------------------------------------------------------------- thoughts
  async addThought(text, localDate2) {
    return this.mutateDay(localDate2, (day) => {
      const thought = {
        id: ulid(),
        text: text.trim(),
        createdAt: this.clock.now(),
        localDate: day.localDate,
        processed: false
      };
      return { ...day, thoughts: [thought, ...day.thoughts] };
    });
  }
  /** Every parked thought on record, newest first — the Park view's backing list. */
  async allThoughts() {
    const all = await this.live();
    const thoughts = all.flatMap((day) => day.thoughts);
    return thoughts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async noteThought(localDate2, thoughtId, note) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      thoughts: day.thoughts.map((thought) => {
        if (thought.id !== thoughtId) return thought;
        const trimmed = note.trim();
        if (!trimmed) {
          const { note: _gone, ...rest } = thought;
          return rest;
        }
        return { ...thought, note: trimmed };
      })
    }));
  }
  async removeThought(localDate2, thoughtId) {
    return this.mutate(localDate2, (day) => ({
      ...day,
      thoughts: day.thoughts.filter((thought) => thought.id !== thoughtId)
    }));
  }
  async markThoughtProcessed(localDate2, thoughtId, action) {
    if (action === "dismiss") return this.removeThought(localDate2, thoughtId);
    return this.mutate(localDate2, (day) => ({
      ...day,
      thoughts: day.thoughts.map(
        (thought) => thought.id === thoughtId ? { ...thought, processed: true } : thought
      )
    }));
  }
  async findThought(localDate2, thoughtId) {
    const day = await this.get(localDate2);
    return day?.thoughts.find((thought) => thought.id === thoughtId) ?? null;
  }
  async findTodo(localDate2, todoId) {
    const day = await this.get(localDate2);
    return day?.todos.find((todo) => todo.id === todoId) ?? null;
  }
  // ------------------------------------------------------------ intent + log
  async setIntent(threadIds) {
    return this.mutateToday((day) => ({ ...day, intentThreadIds: threadIds }));
  }
  /** Typing a note is a real interaction, so it is allowed to bring that day into existence. */
  async setNote(localDate2, note) {
    return this.mutateDay(localDate2, (day) => ({ ...day, note }));
  }
  async setNow(now, localDate2) {
    return this.mutateDay(localDate2, (day) => ({ ...day, now }));
  }
  /** Auto-filled on completion — this panel is the day's evidence, not something to curate. */
  async logThread(threadId) {
    return this.mutateToday(
      (day) => day.loggedThreadIds.includes(threadId) ? day : { ...day, loggedThreadIds: [...day.loggedThreadIds, threadId] }
    );
  }
  async sortedTodos(localDate2) {
    const day = await this.get(localDate2);
    return day ? sortByOrder(day.todos) : [];
  }
}
class GoalRepo {
  constructor(store, clock) {
    this.store = store;
    this.clock = clock;
  }
  get goals() {
    return this.store.collection(COLLECTION.goals);
  }
  /** See `ThreadRepo.live` — a tombstone is a real record, so every read starts by filtering. */
  async live() {
    return (await this.goals.all()).filter((goal) => !goal.deletedAt);
  }
  /** The week key for today, in the user's timezone. */
  currentWeek() {
    return weekKeyOf(this.clock.today());
  }
  async list(weekKey2) {
    const key = weekKey2 ?? this.currentWeek();
    return sortByOrder((await this.live()).filter((goal) => goal.weekKey === key));
  }
  /** Every week that has a goal on it, newest first — for the week picker. */
  async weeks() {
    const keys = new Set((await this.live()).map((goal) => goal.weekKey));
    return [...keys].sort().reverse();
  }
  async get(id) {
    const goal = await this.goals.get(id);
    return goal && !goal.deletedAt ? goal : null;
  }
  async add(title, weekKey2) {
    const key = weekKey2 ?? this.currentWeek();
    const now = this.clock.now();
    const goal = {
      id: ulid(),
      title: title.trim(),
      done: false,
      context: "",
      weekKey: key,
      order: nextOrder(await this.list(key)),
      createdAt: now,
      updatedAt: now
    };
    await this.write(goal);
    return goal;
  }
  async update(id, patch) {
    const goal = await this.require(id);
    const next = {
      ...goal,
      ...patch.title === void 0 ? {} : { title: patch.title.trim() },
      ...patch.context === void 0 ? {} : { context: patch.context },
      updatedAt: this.clock.now()
    };
    await this.write(next);
    return next;
  }
  /**
   * Ticking a goal stamps the local date as well as the timestamp, for the same reason every
   * other record does: a completion bucketed by re-deriving a local day from UTC lands on the
   * wrong side of a DST boundary about twice a year.
   */
  async toggle(id) {
    const goal = await this.require(id);
    const done = !goal.done;
    const now = this.clock.now();
    const { completedAt: _was, completedLocalDate: _onDay, ...rest } = goal;
    const next = done ? {
      ...rest,
      done,
      updatedAt: now,
      completedAt: now,
      completedLocalDate: this.clock.today()
    } : { ...rest, done, updatedAt: now };
    await this.write(next);
    return next;
  }
  async remove(id) {
    const goal = await this.get(id);
    if (!goal) return;
    await this.write({ ...goal, deletedAt: this.clock.now(), updatedAt: this.clock.now() });
  }
  async reorder(id, toIndex) {
    const goal = await this.require(id);
    const { items } = reorder(await this.list(goal.weekKey), id, toIndex);
    for (const item of items) {
      const current = await this.get(item.id);
      if (current && current.order !== item.order) {
        await this.write({ ...current, order: item.order, updatedAt: this.clock.now() });
      }
    }
    return this.list(goal.weekKey);
  }
  /**
   * Move an unfinished goal into another week. A copy would leave the original sitting in a
   * past week looking abandoned, so the goal itself moves and remembers where it came from.
   */
  async carryOver(id, toWeek) {
    const goal = await this.require(id);
    if (goal.weekKey === toWeek) return goal;
    const next = {
      ...goal,
      weekKey: toWeek,
      carriedFromWeek: goal.carriedFromWeek ?? goal.weekKey,
      order: nextOrder(await this.list(toWeek)),
      updatedAt: this.clock.now()
    };
    await this.write(next);
    return next;
  }
  async require(id) {
    const goal = await this.get(id);
    if (!goal) throw new Error("goal not found");
    return goal;
  }
  async write(goal) {
    await this.goals.put(goal);
  }
}
class DayRunRepo {
  constructor(store) {
    this.store = store;
  }
  get runs() {
    return this.store.collection(COLLECTION.dayRuns);
  }
  async get(localDate2) {
    const run = await this.runs.get(localDate2);
    return run && !run.deletedAt ? run : null;
  }
  /**
   * Ignite the day — or resume it. One run per day is the invariant, so pressing Start again
   * after an End reopens the same record rather than pretending the morning did not happen.
   */
  async start(localDate2) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const existing = await this.get(localDate2);
    const run = existing ? { ...existing, endedAt: null, updatedAt: now } : {
      localDate: localDate2,
      startedAt: now,
      endedAt: null,
      shiftMs: 0,
      skippedBlockIds: [],
      updatedAt: now
    };
    await this.runs.put(run);
    return run;
  }
  async save(run) {
    await this.runs.put(run);
    return run;
  }
  /** Let one block go, on purpose. Skipping is a decision and reads as one — never "missed". */
  async skip(localDate2, blockId) {
    const run = await this.get(localDate2);
    if (!run) throw new Error("The day has not been started.");
    if (run.skippedBlockIds.includes(blockId)) return run;
    return this.save({
      ...run,
      skippedBlockIds: [...run.skippedBlockIds, blockId],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  async end(localDate2) {
    const run = await this.get(localDate2);
    if (!run) return null;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return this.save({ ...run, endedAt: now, updatedAt: now });
  }
}
class InsightRepo {
  constructor(store) {
    this.store = store;
  }
  get insights() {
    return this.store.collection(COLLECTION.insights);
  }
  async get(periodKey) {
    const insight = await this.insights.get(periodKey);
    return insight && !insight.deletedAt ? insight : null;
  }
}
function effectiveBlocks(plan, run) {
  const shiftMinutes = run ? Math.round(run.shiftMs / 6e4) : 0;
  const anchor = run?.shiftFrom ? toMinutes$2(run.shiftFrom) : null;
  const skipped = new Set(run?.skippedBlockIds ?? []);
  return plan.blocks.map((block) => {
    const slides = anchor !== null && toMinutes$2(block.start) >= anchor;
    const offset = slides ? shiftMinutes : 0;
    return {
      block,
      start: toMinutes$2(block.start) + offset,
      end: toMinutes$2(block.end) + offset,
      skipped: skipped.has(block.id)
    };
  }).sort((a, b) => a.start - b.start);
}
const DAY_START = "00:00";
function applyShift(plan, run, deltaMs, nowMinutes, scope = "rest") {
  const frontier = effectiveBlocks(plan, run).filter((entry) => !entry.skipped).find((entry) => entry.end > nowMinutes);
  const proposed = scope === "day" ? DAY_START : frontier?.block.start;
  const anchor = earlier(run.shiftFrom, proposed);
  const shiftMs = run.shiftMs + deltaMs;
  const { shiftFrom: _replaced, ...rest } = run;
  return {
    ...rest,
    shiftMs,
    ...shiftMs !== 0 && anchor ? { shiftFrom: anchor } : {},
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function earlier(a, b) {
  if (!a) return b;
  if (!b) return a;
  return toMinutes$2(a) <= toMinutes$2(b) ? a : b;
}
function toMinutes$2(time) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}
function toClock(minutes) {
  const clamped = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}
function ladderOf(blocks) {
  const gaps = blocks.map((block, index) => {
    const next = blocks[index + 1];
    return next ? toMinutes$2(next.start) - toMinutes$2(block.end) : 0;
  });
  return { start: blocks.length ? toMinutes$2(blocks[0].start) : 0, gaps };
}
function layOnLadder(sequence, ladder) {
  let cursor = ladder.start;
  return sequence.map((block, index) => {
    const duration = toMinutes$2(block.end) - toMinutes$2(block.start);
    const start = toClock(cursor);
    const end = toClock(cursor + duration);
    cursor += duration + (ladder.gaps[index] ?? 0);
    if (start === block.start && end === block.end) return block;
    return { ...block, start, end, pinned: true };
  });
}
function resequenceBlocks(blocks, order) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  if (order.length !== blocks.length || order.some((id) => !byId.has(id))) {
    throw new Error("The plan changed while you were moving that block.");
  }
  const sequence = order.map((id) => byId.get(id));
  return layOnLadder(sequence, ladderOf(blocks));
}
function insertBlock(blocks, index, block) {
  const at = Math.max(0, Math.min(blocks.length, index));
  const push = Math.max(0, toMinutes$2(block.end) - startOf(blocks[at]));
  const before = blocks.slice(0, at);
  const after = blocks.slice(at).map((later) => push > 0 ? shift(later, push) : later);
  return [...before, { ...block, pinned: true }, ...after];
}
function startOf(block) {
  return block ? toMinutes$2(block.start) : Number.POSITIVE_INFINITY;
}
function shift(block, minutes) {
  return {
    ...block,
    start: toClock(toMinutes$2(block.start) + minutes),
    end: toClock(toMinutes$2(block.end) + minutes)
  };
}
function sortBlocks(blocks) {
  const minutes = (time) => {
    const [hour = 0, minute = 0] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  return [...blocks].sort((a, b) => minutes(a.start) - minutes(b.start));
}
class PlanRepo {
  constructor(store) {
    this.store = store;
  }
  get plans() {
    return this.store.collection(COLLECTION.plans);
  }
  get weeks() {
    return this.store.collection(COLLECTION.weekPlans);
  }
  /**
   * Untracked views of the same collections, for writing records that came *from* the server.
   * Queueing those for push would send them straight back and burn a round trip settling a
   * conflict with ourselves — the sync engine takes the same route when it merges a pull.
   */
  get plansUntracked() {
    return this.store.collection(COLLECTION.plans, { track: false });
  }
  get weeksUntracked() {
    return this.store.collection(COLLECTION.weekPlans, { track: false });
  }
  async getWeek(weekKey2) {
    const plan = await this.weeks.get(weekKey2);
    return plan && !plan.deletedAt ? plan : null;
  }
  /**
   * Every plan between two local dates, in date order.
   *
   * By date rather than by week key, because the calendar's ranges do not respect week
   * boundaries — a month grid starts on whatever Monday the 1st falls after, and a week read
   * across a year boundary spans two week-key partitions.
   */
  async range(from, to) {
    const all = await this.plans.all();
    return all.filter((plan) => !plan.deletedAt && plan.localDate >= from && plan.localDate <= to).sort((a, b) => a.localDate.localeCompare(b.localDate));
  }
  /**
   * The runs for a set of week keys.
   *
   * By key rather than by the dates a run covers, because `fromDate`/`toDate` are the window
   * that run *planned* — pressed on a Thursday they read Thursday to Sunday. Matching a
   * Monday-to-Wednesday range against those would find no run for a week that plainly has one.
   */
  async weeksFor(weekKeys) {
    const wanted = new Set(weekKeys);
    const all = await this.weeks.all();
    return all.filter((plan) => !plan.deletedAt && wanted.has(plan.weekKey)).sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  }
  /** Every day of a week that still has a plan, in date order. */
  async listWeekDays(weekKey2) {
    const all = await this.plans.all();
    return all.filter((plan) => plan.weekKey === weekKey2 && !plan.deletedAt).sort((a, b) => a.localDate.localeCompare(b.localDate));
  }
  /**
   * Store one generation run: the week record and every day it produced.
   *
   * Days of the same week that this run did *not* produce are tombstoned. The server does the
   * same thing, and for the same reason: if Thursday had a plan and the new run decided Thursday
   * is a rest day, leaving the old Thursday on screen shows a block list nothing generated.
   */
  async saveWeek(week, days) {
    const produced = new Set(days.map((plan) => plan.localDate));
    const stale = (await this.listWeekDays(week.weekKey)).filter(
      (plan) => !produced.has(plan.localDate) && plan.localDate >= week.fromDate
    );
    for (const plan of stale) {
      await this.plansUntracked.put({ ...plan, deletedAt: week.generatedAt });
    }
    for (const plan of days) {
      await this.plansUntracked.put(plan);
    }
    await this.weeksUntracked.put(week);
  }
  /** A thrown-away plan reads as no plan. The tombstone stays on disk for the next push. */
  async get(localDate2) {
    const plan = await this.plans.get(localDate2);
    return plan && !plan.deletedAt ? plan : null;
  }
  async save(plan) {
    await this.plans.put(plan);
    return plan;
  }
  /**
   * Point a block at a thread. Kept here rather than done by the caller so the plan is only ever
   * rewritten whole through one path — a block edited in place elsewhere would not be persisted.
   *
   * `promoted` is stamped alongside the id, and is the more important of the two. It is what
   * tells the next generation that this hour is spoken for: the server carries promoted blocks
   * across a regeneration untouched, so planning again on Friday cannot orphan the thread you
   * started on Wednesday. `updatedAt` moves too, because this write has to reach the server for
   * that to happen at all.
   */
  async linkBlock(localDate2, blockId, threadId) {
    const plan = await this.get(localDate2);
    if (!plan) throw new Error("no plan for that day");
    const next = {
      ...plan,
      blocks: plan.blocks.map(
        (block) => block.id === blockId ? { ...block, threadId, promoted: true } : block
      ),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.save(next);
  }
  /**
   * Rewrite one block by hand, or add a new one.
   *
   * Every hand edit stamps `pinned: true` — the contract `promoted` earns by starting work,
   * earned here by touch. The server carries pinned blocks across a regeneration untouched, so
   * an edited block is owned rather than replaced. Written through the tracked collection so
   * the edit is queued for push; blocks are re-sorted so the list still reads as a day.
   */
  async editBlock(localDate2, block, shell2) {
    const plan = await this.get(localDate2) ?? this.emptyPlan(localDate2, shell2);
    const edited = { ...block, pinned: true };
    const rest = plan.blocks.filter((candidate) => candidate.id !== block.id);
    const next = {
      ...plan,
      blocks: sortBlocks([...rest, edited]),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.save(next);
  }
  /**
   * Put the day's blocks in a new order.
   *
   * The reordering itself lives in `@shared/planLayout` so the phone and the laptop agree on
   * where a dragged block lands. Here it is only persistence — written through the tracked
   * collection like any hand edit, and re-sorted afterwards because the times changed under it.
   */
  async reorderBlocks(localDate2, blockIds) {
    const plan = await this.get(localDate2);
    if (!plan) throw new Error("There is no plan for that day.");
    const next = {
      ...plan,
      blocks: sortBlocks(resequenceBlocks(plan.blocks, blockIds)),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.save(next);
  }
  /**
   * Open a new slot at a position in the day, pushing what follows if it has to.
   *
   * A day that was never planned still gets one: opening a slot on an empty Thursday is a
   * perfectly good way to start planning it, and refusing would send you to the generator for
   * a single errand.
   */
  async insertBlock(localDate2, index, block, shell2) {
    const plan = await this.get(localDate2) ?? this.emptyPlan(localDate2, shell2);
    const next = {
      ...plan,
      blocks: sortBlocks(insertBlock(plan.blocks, index, block)),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.save(next);
  }
  /** Remove one block. The day keeps its plan — an emptied plan is still a decision. */
  async deleteBlock(localDate2, blockId) {
    const plan = await this.get(localDate2);
    if (!plan) return null;
    const next = {
      ...plan,
      blocks: plan.blocks.filter((block) => block.id !== blockId),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    return this.save(next);
  }
  /**
   * Move a block to another day. It lands pinned — moving is the strongest possible edit — and
   * the target day gets a plan shell if it never had one, because "Thursday, but really Friday"
   * must not depend on Friday having been planned.
   */
  async moveBlock(fromDate, toDate, blockId, shell2) {
    const source = await this.get(fromDate);
    const block = source?.blocks.find((candidate) => candidate.id === blockId);
    if (!source || !block) throw new Error("That block is no longer in the plan.");
    const from = await this.deleteBlock(fromDate, blockId);
    const to = await this.editBlock(toDate, block, shell2);
    return { from, to };
  }
  emptyPlan(localDate2, shell2) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      localDate: localDate2,
      weekKey: weekKeyOf(localDate2),
      generatedAt: now,
      wakeTime: shell2?.wakeTime ?? "07:00",
      startTime: shell2?.startTime ?? "09:00",
      endTime: shell2?.endTime ?? "18:00",
      blocks: [],
      headline: "",
      updatedAt: now
    };
  }
  /**
   * Throw a day's plan away.
   *
   * A tombstone rather than a delete, and written through the *tracked* collection so it is
   * queued for push. This is the one thing a client authors about a plan, and it has to reach
   * the other device — a local-only delete is a plan that reappears on the next pull.
   */
  async remove(localDate2) {
    const plan = await this.plans.get(localDate2);
    if (!plan) return;
    await this.plans.put({
      ...plan,
      deletedAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  /**
   * Spend, summed from the runs themselves rather than from a separate ledger file. One less
   * thing to keep in step with reality, and deleting a plan correctly forgets what it cost.
   *
   * Summed over `weekPlans`, not `plans`: one press of the button is one API call that produces
   * up to seven days, so counting per day would report several times the real bill. Old local
   * day plans still carry their own `usage` and are added in — dropping them would make the
   * all-time figure quietly shrink the first time this version ran.
   */
  async spend(month) {
    const weeks = (await this.weeks.all()).filter((plan) => !plan.deletedAt);
    const legacy = (await this.plans.all()).filter(
      (plan) => !plan.weekKey && plan.usage && !plan.deletedAt
    );
    const inMonth = (entry) => entry.month === month;
    const runs = [
      ...weeks.map((plan) => ({ month: plan.generatedAt.slice(0, 7), costUsd: plan.usage.costUsd })),
      ...legacy.map((plan) => ({
        month: plan.localDate.slice(0, 7),
        costUsd: plan.usage?.costUsd ?? 0
      }))
    ];
    const thisMonth = runs.filter(inMonth);
    const sum = (entries) => entries.reduce((total, entry) => total + entry.costUsd, 0);
    return {
      month,
      plans: thisMonth.length,
      costUsd: sum(thisMonth),
      totalPlans: runs.length,
      totalCostUsd: sum(runs)
    };
  }
}
class SessionRepo {
  constructor(store) {
    this.store = store;
  }
  /** Not deleted. See `ThreadRepo.live` for why tombstones stay on disk. */
  async live() {
    return (await this.sessions.all()).filter((session) => !session.deletedAt);
  }
  get sessions() {
    return this.store.collection(COLLECTION.sessions);
  }
  async get(id) {
    const session = await this.sessions.get(id);
    return session && !session.deletedAt ? session : null;
  }
  /**
   * `updatedAt` is stamped here, on the one write path, rather than by each caller. It is when
   * the user made the change, and it is the entire conflict rule — a record that reaches the
   * server without it loses to whatever is already there.
   */
  async save(session) {
    await this.sessions.put({ ...session, updatedAt: (/* @__PURE__ */ new Date()).toISOString() });
  }
  async all() {
    return this.live();
  }
  async forThread(threadId) {
    const all = await this.live();
    return all.filter((session) => session.threadId === threadId).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  /**
   * Sessions falling on local dates in [from, to]. This used to reason about ULID timestamps to
   * decide which shards it could skip; everything is already in memory now, so it is a filter.
   */
  async inLocalDateRange(from, to) {
    const all = await this.live();
    return all.filter((session) => session.localDate >= from && session.localDate <= to).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }
  /** A session left open by a crash — the most recent one that never got an end time. */
  async findOpen() {
    const all = await this.live();
    return all.filter((session) => !session.endedAt).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  }
}
const settingsSchema = z.object({
  version: z.literal(1),
  defaultSessionMs: z.number().positive(),
  distractionGraceMs: z.number().min(DISTRACTION_GRACE_MIN_MS).max(DISTRACTION_GRACE_MAX_MS),
  soundEnabled: z.boolean(),
  celebrationsEnabled: z.boolean(),
  recentCelebrationIds: z.array(z.string()),
  railCollapsed: z.boolean(),
  hudBounds: z.object({ x: z.number(), y: z.number() }).optional(),
  calendarBounds: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }).optional(),
  calendarWidgetScope: z.enum(["day", "week", "month"]).optional(),
  timezone: z.string(),
  lastOpenSessionId: z.string().optional(),
  wakeTime: clockTime().default("07:30"),
  dayStartTime: clockTime().default("09:00"),
  dayEndTime: clockTime().default("18:00"),
  plannerContext: z.string().default(""),
  plannerModel: z.string().default(PLANNER_DEFAULT_MODEL),
  plannerEffort: z.enum(["low", "medium", "high"]).default("medium"),
  nudgesEnabled: z.boolean().default(true)
});
function clockTime() {
  return z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected a 24-hour HH:MM time");
}
function defaultSettings() {
  return {
    version: 1,
    defaultSessionMs: DEFAULT_SESSION_MS,
    distractionGraceMs: DEFAULT_DISTRACTION_GRACE_MS,
    soundEnabled: true,
    celebrationsEnabled: true,
    recentCelebrationIds: [],
    railCollapsed: false,
    timezone: systemTimezone(),
    wakeTime: "07:30",
    dayStartTime: "09:00",
    dayEndTime: "18:00",
    plannerContext: "",
    plannerModel: PLANNER_DEFAULT_MODEL,
    // `medium` plans a day as well as `high` does and spends a fraction of the thinking tokens.
    plannerEffort: "medium",
    nudgesEnabled: true
  };
}
class SettingsRepo {
  constructor(root) {
    this.root = root;
  }
  cached = defaultSettings();
  get file() {
    return path.join(this.root, "settings.json");
  }
  async load() {
    const raw = await readFileIfExists(this.file);
    if (raw === null) {
      this.cached = defaultSettings();
      await this.persist();
      return this.cached;
    }
    const parsed = settingsSchema.safeParse(JSON.parse(raw));
    this.cached = parsed.success ? parsed.data : defaultSettings();
    return this.cached;
  }
  get() {
    return this.cached;
  }
  async update(patch) {
    this.cached = settingsSchema.parse({ ...this.cached, ...patch });
    await this.persist();
    return this.cached;
  }
  async persist() {
    await atomicWriteFile(this.file, serialise(this.cached));
  }
}
class ThreadRepo {
  constructor(store, clock) {
    this.store = store;
    this.clock = clock;
  }
  get threads() {
    return this.store.collection(COLLECTION.threads);
  }
  async list() {
    const threads = await this.live();
    return threads.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  /**
   * Everything that has not been deleted. A tombstone is a real record on disk — it has to be,
   * or another device never learns about the delete — so every read path starts here rather
   * than at the collection.
   */
  async live() {
    return (await this.threads.all()).filter((thread) => !thread.deletedAt);
  }
  /** On the board (§2): not done, not dormant. This is the list the cap of 5 applies to. */
  async activeList() {
    const threads = await this.list();
    return threads.filter((thread) => thread.status !== "done" && thread.status !== "dormant");
  }
  async dormantList() {
    const threads = await this.list();
    return threads.filter((thread) => thread.status === "dormant");
  }
  async get(id) {
    const thread = await this.threads.get(id);
    return thread && !thread.deletedAt ? thread : null;
  }
  async create(title, notes = "") {
    const now = this.clock.now();
    const board = await this.activeList();
    const thread = {
      id: ulid(),
      title: title.trim(),
      notes,
      // A thread you just made is a thread you are on. Focus Tracker has no separate "idle".
      status: "in_progress",
      order: nextOrder(withOrders(board)),
      steps: [],
      createdAt: now,
      updatedAt: now,
      totalFocusMs: 0,
      sessionCount: 0,
      distractionCount: 0,
      archived: false
    };
    await this.save(thread);
    return thread;
  }
  async save(thread) {
    const next = { ...thread, updatedAt: this.clock.now() };
    await this.threads.put(next);
    return next;
  }
  /**
   * Leaves a tombstone rather than removing the record. A thread that simply stops existing
   * looks identical to one the server has never seen, so it comes back the next time the phone
   * syncs — deletes have to be something a client can *receive*.
   */
  async remove(id) {
    const thread = await this.threads.get(id);
    if (!thread) return;
    const now = this.clock.now();
    await this.threads.put({ ...thread, updatedAt: now, deletedAt: now });
  }
  async setStatus(id, status, waitingOn) {
    const thread = await this.require(id);
    const next = { ...thread, status };
    if (status === "waiting" || status === "blocked") {
      next.waitingOn = waitingOn?.trim() || thread.waitingOn || "";
    } else {
      delete next.waitingOn;
    }
    if (status !== "done" && status !== "dormant" && (thread.status === "done" || thread.status === "dormant")) {
      next.order = nextOrder(withOrders(await this.activeList()));
    }
    if (status === "done") {
      next.completedAt = this.clock.now();
      next.completedLocalDate = this.clock.today();
    } else {
      delete next.completedAt;
      delete next.completedLocalDate;
    }
    return this.save(next);
  }
  // ------------------------------------------------------------------ steps
  async addStep(threadId, text, afterStepId) {
    const thread = await this.require(threadId);
    const step = {
      id: ulid(),
      text: text.trim(),
      done: false,
      order: afterStepId ? orderAfter(thread.steps, afterStepId) : nextOrder(thread.steps)
    };
    return this.save({ ...thread, steps: sortByOrder([...thread.steps, step]) });
  }
  async toggleStep(threadId, stepId) {
    const thread = await this.require(threadId);
    const steps = thread.steps.map((step) => {
      if (step.id !== stepId) return step;
      if (step.done) {
        const { completedAt: _a, completedLocalDate: _b, ...rest } = step;
        return { ...rest, done: false };
      }
      return {
        ...step,
        done: true,
        completedAt: this.clock.now(),
        completedLocalDate: this.clock.today()
      };
    });
    return this.save({ ...thread, steps });
  }
  async updateStep(threadId, stepId, text) {
    const thread = await this.require(threadId);
    const steps = thread.steps.map((step) => step.id === stepId ? { ...step, text } : step);
    return this.save({ ...thread, steps });
  }
  async removeStep(threadId, stepId) {
    const thread = await this.require(threadId);
    return this.save({ ...thread, steps: thread.steps.filter((step) => step.id !== stepId) });
  }
  async reorderStep(threadId, stepId, toIndex) {
    const thread = await this.require(threadId);
    const { items } = reorder(thread.steps, stepId, toIndex);
    return this.save({ ...thread, steps: items });
  }
  // --------------------------------------------------------------- board order
  /**
   * Drag-and-drop (§2). Moving between Active and Dormant is the same gesture as reordering,
   * so `status` and position are set in one write rather than two.
   */
  async reorderOnBoard(id, toIndex, status) {
    const thread = await this.require(id);
    const target = status ?? thread.status;
    const intoDormant = target === "dormant";
    const siblings = boardOrder(
      (await this.list()).filter(
        (other) => other.id !== id && other.status !== "done" && other.status === "dormant" === intoDormant
      )
    );
    const moved = { ...thread, status: target };
    const { items } = reorder(withOrders([...siblings, moved]), id, toIndex);
    const orders = new Map(items.map((item) => [item.id, item.order]));
    const written = [];
    for (const candidate of [...siblings, moved]) {
      const order = orders.get(candidate.id);
      if (order === void 0) continue;
      const current = await this.get(candidate.id);
      if (current && current.order === order && current.status === candidate.status) continue;
      written.push(await this.save({ ...candidate, order }));
    }
    return written;
  }
  // ----------------------------------------------------------------- done
  /**
   * The done pile, newest first. This used to walk archive shards to avoid loading the whole
   * archive; there is one threads file now and it is already in memory, so it is a filter and
   * a slice.
   */
  async donePage({ before, limit }) {
    const done = (await this.live()).filter((thread) => thread.status === "done").filter((thread) => !before || (thread.completedLocalDate ?? "") < before).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
    return { threads: done.slice(0, limit), hasMore: done.length > limit };
  }
  /**
   * Marks long-finished threads archived on boot. This used to move them into separate shard
   * files to keep active.json small; there is one file now, so the flag is only a marker for
   * anything that wants to tell old completions from recent ones.
   */
  async archiveStale() {
    const cutoff = addLocalDays(this.clock.today(), -30);
    const stale = (await this.list()).filter(
      (thread) => thread.status === "done" && !thread.archived && (thread.completedLocalDate ?? "") < cutoff
    );
    for (const thread of stale) await this.save({ ...thread, archived: true });
    return stale.length;
  }
  async require(id) {
    const thread = await this.get(id);
    if (!thread) throw new Error(`thread not found: ${id}`);
    return thread;
  }
}
function boardOrder(threads) {
  return [...threads].sort((a, b) => {
    if (a.order !== void 0 && b.order !== void 0) return a.order - b.order;
    if (a.order !== void 0) return -1;
    if (b.order !== void 0) return 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}
function withOrders(threads) {
  return boardOrder(threads).map((thread, index) => ({
    id: thread.id,
    order: thread.order ?? (index + 1) * ORDER_STEP
  }));
}
class Database {
  constructor(root, store, clock, threads, days, goals, plans, dayRuns, insights, sessions, settings, migration) {
    this.root = root;
    this.store = store;
    this.clock = clock;
    this.threads = threads;
    this.days = days;
    this.goals = goals;
    this.plans = plans;
    this.dayRuns = dayRuns;
    this.insights = insights;
    this.sessions = sessions;
    this.settings = settings;
    this.migration = migration;
  }
  static async open(root, events = {}) {
    const settings = new SettingsRepo(root);
    await settings.load();
    const clock = systemClock(() => settings.get().timezone);
    const migration = await migrate(root);
    const store = await JsonStore.open(root, collections, {
      onUnreadable: events.onUnreadable,
      onWrite: events.onWrite
    });
    const days = new DayRepo(store, clock);
    const threads = new ThreadRepo(store, clock);
    const goals = new GoalRepo(store, clock);
    const plans = new PlanRepo(store);
    const dayRuns = new DayRunRepo(store);
    const insights = new InsightRepo(store);
    const sessions = new SessionRepo(store);
    return new Database(
      root,
      store,
      clock,
      threads,
      days,
      goals,
      plans,
      dayRuns,
      insights,
      sessions,
      settings,
      migration
    );
  }
  async close() {
    await this.store.close();
  }
}
function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}
function dailyMomentumScore(input) {
  const { sessionStarted, focusMinute, stepCompleted, threadCompleted } = DMS_WEIGHTS;
  const total = Math.min(input.sessionsStarted * sessionStarted.points, sessionStarted.cap) + Math.min(input.focusMs / 6e4 * focusMinute.points, focusMinute.cap) + Math.min(input.stepsCompleted * stepCompleted.points, stepCompleted.cap) + Math.min(input.threadsCompleted * threadCompleted.points, threadCompleted.cap);
  return Math.round(clamp(total, 0, 100));
}
function rollingMomentum(scores, alpha) {
  const out = [];
  let previous = 0;
  for (const score of scores) {
    previous = alpha * score + (1 - alpha) * previous;
    out.push(Math.round(previous));
  }
  return out;
}
function dayMomentumSeries(dailyScores) {
  return rollingMomentum(dailyScores, MOMENTUM_ALPHA.day);
}
function weekScore(dailyScoresInWeek) {
  if (dailyScoresInWeek.length === 0) return 0;
  const mean = dailyScoresInWeek.reduce((sum, value) => sum + value, 0) / dailyScoresInWeek.length;
  return Math.round(clamp(mean * WEEK_SCORE_LIFT, 0, 100));
}
function monthScore(weeklyScoresInMonth) {
  if (weeklyScoresInMonth.length === 0) return 0;
  const mean = weeklyScoresInMonth.reduce((sum, value) => sum + value, 0) / weeklyScoresInMonth.length;
  return Math.round(clamp(mean, 0, 100));
}
const BANDS = [
  // "Resting", not "Inactive" or "Low" — this is the difference between a dashboard you open on
  // a bad week and one you avoid.
  { max: 14, id: "resting", label: "Resting" },
  { max: 34, id: "warming", label: "Warming up" },
  { max: 59, id: "rolling", label: "Rolling" },
  { max: 79, id: "flow", label: "In flow" },
  { max: 100, id: "lit", label: "Lit" }
];
function bandFor(momentum) {
  const value = clamp(Math.round(momentum), 0, 100);
  const match = BANDS.find((band) => value <= band.max) ?? BANDS[BANDS.length - 1];
  return { id: match.id, label: match.label };
}
function activeDays(rollups, dates) {
  const window = dates.slice(-14);
  const active = window.filter((date2) => {
    const rollup = rollups[date2];
    return Boolean(rollup && rollup.sessionsStarted > 0);
  }).length;
  return { active, window: window.length };
}
function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? null;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}
function zeros() {
  return Array.from({ length: 24 }, () => 0);
}
function bump(buckets, hour) {
  buckets[hour] = (buckets[hour] ?? 0) + 1;
}
function emptyRollup(localDate2) {
  return {
    localDate: localDate2,
    sessionsStarted: 0,
    focusMs: 0,
    stepsCompleted: 0,
    threadsCompleted: 0,
    distractions: 0,
    dms: 0,
    hourStarts: zeros(),
    hourDistractions: zeros(),
    msToFirstDistraction: [],
    internalDistractions: 0,
    externalDistractions: 0,
    longestSessionMs: 0
  };
}
function computeDayRollup(localDate2, sessions, threads, timezone) {
  const rollup = emptyRollup(localDate2);
  for (const session of sessions) {
    if (session.localDate !== localDate2) continue;
    rollup.sessionsStarted += 1;
    rollup.focusMs += session.activeMs;
    rollup.longestSessionMs = Math.max(rollup.longestSessionMs, session.activeMs);
    bump(rollup.hourStarts, localHourOf(session.startedAt, timezone));
    const ordered = [...session.distractions].sort((a, b) => a.at.localeCompare(b.at));
    const first = ordered[0];
    if (first) {
      rollup.msToFirstDistraction.push(
        Math.max(0, Date.parse(first.at) - Date.parse(session.startedAt))
      );
    }
    for (const distraction of ordered) {
      rollup.distractions += 1;
      bump(rollup.hourDistractions, localHourOf(distraction.at, timezone));
      if (distraction.kind === "internal") rollup.internalDistractions += 1;
      if (distraction.kind === "external") rollup.externalDistractions += 1;
    }
  }
  for (const thread of threads) {
    if (thread.completedLocalDate === localDate2) rollup.threadsCompleted += 1;
    for (const step of thread.steps) {
      if (step.done && step.completedLocalDate === localDate2) rollup.stepsCompleted += 1;
    }
  }
  rollup.dms = dailyMomentumScore(rollup);
  return rollup;
}
function datesTouched(sessions, threads) {
  const dates = /* @__PURE__ */ new Set();
  for (const session of sessions) dates.add(session.localDate);
  for (const thread of threads) {
    if (thread.completedLocalDate) dates.add(thread.completedLocalDate);
    for (const step of thread.steps) {
      if (step.completedLocalDate) dates.add(step.completedLocalDate);
    }
  }
  return [...dates].sort();
}
function hourLabel(hour) {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}
function recovery(input) {
  const { window } = input;
  if (window.length < 4) return null;
  const latest = window[window.length - 1];
  if (!latest || latest.dms <= 0) return null;
  let quiet = 0;
  for (let i = window.length - 2; i >= 0; i -= 1) {
    if ((window[i]?.dms ?? 0) > 0) break;
    quiet += 1;
  }
  if (quiet < 3) return null;
  return {
    kind: "recovery",
    headline: "Back up after a quiet stretch.",
    detail: "That's the hard part."
  };
}
function personalBest(input) {
  const latest = input.window[input.window.length - 1];
  if (!latest || latest.dms === 0) return null;
  const others = input.recent.filter((day) => day.localDate !== latest.localDate);
  const bestScore = others.reduce((max, day) => Math.max(max, day.dms), 0);
  if (latest.dms > bestScore && bestScore > 0) {
    return { kind: "personal_best", headline: "Your strongest day in a month." };
  }
  const bestSession = others.reduce((max, day) => Math.max(max, day.longestSessionMs), 0);
  if (latest.longestSessionMs > bestSession && bestSession > 0) {
    return {
      kind: "personal_best",
      headline: "Longest single session in a month.",
      detail: formatDuration(latest.longestSessionMs)
    };
  }
  return null;
}
function peakHours(input) {
  const totals = Array.from({ length: 24 }, () => 0);
  for (const day of input.window) {
    day.hourStarts.forEach((count, hour) => {
      totals[hour] = (totals[hour] ?? 0) + count;
    });
  }
  if (totals.reduce((sum, value) => sum + value, 0) < 5) return null;
  let bestHour = 0;
  let bestCount = -1;
  for (let hour = 0; hour < 23; hour += 1) {
    const pair = (totals[hour] ?? 0) + (totals[hour + 1] ?? 0);
    if (pair > bestCount) {
      bestCount = pair;
      bestHour = hour;
    }
  }
  if (bestCount <= 0) return null;
  return {
    kind: "peak_hours",
    headline: `You start most often between ${hourLabel(bestHour)} and ${hourLabel(bestHour + 2)}.`
  };
}
function distractionPattern(input) {
  const totals = Array.from({ length: 24 }, () => 0);
  for (const day of input.window) {
    day.hourDistractions.forEach((count, hour) => {
      totals[hour] = (totals[hour] ?? 0) + count;
    });
  }
  const total = totals.reduce((sum, value) => sum + value, 0);
  if (total < 5) return null;
  const peak = totals.reduce(
    (best, count, hour) => count > best.count ? { hour, count } : best,
    { hour: 0, count: 0 }
  );
  if (peak.count < 3) return null;
  return {
    kind: "distraction_pattern",
    headline: `Distractions cluster around ${hourLabel(peak.hour)}.`,
    detail: "Worth a break there?"
  };
}
function waitingWatch(input) {
  const stale = input.threads.filter((thread) => thread.status === "waiting").map((thread) => ({ thread, days: diffLocalDays(thread.updatedAt.slice(0, 10), input.today) })).filter((entry) => entry.days >= 5).sort((a, b) => b.days - a.days)[0];
  if (!stale) return null;
  return {
    kind: "waiting_watch",
    headline: `'${stale.thread.title}' has been waiting ${stale.days} days.`,
    ...stale.thread.waitingOn ? { detail: `On: ${stale.thread.waitingOn}` } : {}
  };
}
function fallback(input) {
  const focusMs = input.window.reduce((sum, day) => sum + day.focusMs, 0);
  return {
    kind: "fallback",
    headline: focusMs > 0 ? `${formatDuration(focusMs)} of focus in this stretch.` : "Nothing logged yet here."
  };
}
function pickInsight(input) {
  return recovery(input) ?? personalBest(input) ?? peakHours(input) ?? distractionPattern(input) ?? waitingWatch(input) ?? fallback(input);
}
function scopeBounds(scope, anchor) {
  if (scope === "day") return { from: anchor, to: anchor };
  if (scope === "week") {
    const from = startOfLocalWeek(anchor);
    return { from, to: addLocalDays(from, 6) };
  }
  return { from: startOfLocalMonth(anchor), to: endOfLocalMonth(anchor) };
}
function scopeLabel(scope, from, to) {
  if (scope === "day") return formatLocalDate(from);
  if (scope === "week") return `${formatLocalDate(from)} – ${formatLocalDate(to)}`;
  return formatMonth(from);
}
function momentumThrough(rollups, upTo) {
  const dates = Object.keys(rollups).sort();
  const first = dates[0];
  if (!first || first > upTo) return 0;
  const scores = localDateRange(first, upTo).map((date2) => rollups[date2]?.dms ?? 0);
  const series = dayMomentumSeries(scores);
  return series[series.length - 1] ?? 0;
}
function weekMomentum(rollups, weekStart2) {
  const days = localDateRange(weekStart2, addLocalDays(weekStart2, 6));
  return weekScore(days.map((date2) => rollups[date2]?.dms ?? 0));
}
function monthMomentum(rollups, monthStart) {
  const end = endOfLocalMonth(monthStart);
  const weeks = [];
  for (let cursor = startOfLocalWeek(monthStart); cursor <= end; cursor = addLocalDays(cursor, 7)) {
    weeks.push(weekMomentum(rollups, cursor));
  }
  return monthScore(weeks);
}
function buildTrend(input, from, to) {
  if (input.scope === "month") {
    const points = [];
    for (let cursor = startOfLocalWeek(from); cursor <= to; cursor = addLocalDays(cursor, 7)) {
      const week = localDateRange(cursor, addLocalDays(cursor, 6));
      const present = week.filter((date2) => input.rollups[date2]);
      points.push({
        key: cursor,
        label: formatLocalDate(cursor),
        value: present.length === 0 ? null : weekMomentum(input.rollups, cursor)
      });
    }
    return points;
  }
  const [start, end] = input.scope === "day" ? [addLocalDays(from, -13), to] : [from, to];
  return localDateRange(start, end).map((date2) => ({
    key: date2,
    label: formatLocalDate(date2),
    value: input.rollups[date2]?.dms ?? null
  }));
}
function buildDistractionStats(window) {
  const hourHistogram = Array.from({ length: 24 }, () => 0);
  let internal = 0;
  let external = 0;
  let total = 0;
  let focusMs = 0;
  const firsts = [];
  for (const day of window) {
    day.hourDistractions.forEach((count, hour) => {
      hourHistogram[hour] = (hourHistogram[hour] ?? 0) + count;
    });
    internal += day.internalDistractions;
    external += day.externalDistractions;
    total += day.distractions;
    focusMs += day.focusMs;
    firsts.push(...day.msToFirstDistraction);
  }
  const focusedHours = focusMs / 36e5;
  const medianMsToFirst = median(firsts);
  return {
    // A rate, not a total — totals punish long sessions.
    perFocusedHour: focusedHours > 0 ? Number((total / focusedHours).toFixed(1)) : 0,
    hourHistogram,
    internal,
    external,
    untagged: Math.max(0, total - internal - external),
    medianMsToFirst,
    // Suggest, never enforce: rounded up to the next 5 minutes.
    suggestedSessionMs: medianMsToFirst === null ? null : Math.ceil(medianMsToFirst / 3e5) * 3e5
  };
}
function buildDetail(present, rollups) {
  const hourStarts = Array.from({ length: 24 }, () => 0);
  let sessions = 0;
  let focusMs = 0;
  let longestSessionMs = 0;
  let stepsCompleted = 0;
  for (const day of present) {
    sessions += day.sessionsStarted;
    focusMs += day.focusMs;
    stepsCompleted += day.stepsCompleted;
    longestSessionMs = Math.max(longestSessionMs, day.longestSessionMs);
    day.hourStarts.forEach((count, hour) => {
      hourStarts[hour] = (hourStarts[hour] ?? 0) + count;
    });
  }
  const busiest = hourStarts.reduce(
    (best, count, hour) => count > (hourStarts[best] ?? 0) ? hour : best,
    0
  );
  const every = Object.values(rollups);
  return {
    stepsCompleted,
    avgSessionMs: sessions > 0 ? Math.round(focusMs / sessions) : 0,
    longestSessionMs,
    peakStartHour: (hourStarts[busiest] ?? 0) > 0 ? busiest : null,
    hourStarts,
    daysWorked: present.filter((day) => day.sessionsStarted > 0).length,
    allTime: {
      sessionsStarted: every.reduce((sum, day) => sum + day.sessionsStarted, 0),
      focusMs: every.reduce((sum, day) => sum + day.focusMs, 0),
      threadsCompleted: every.reduce((sum, day) => sum + day.threadsCompleted, 0),
      stepsCompleted: every.reduce((sum, day) => sum + day.stepsCompleted, 0),
      daysWorked: every.filter((day) => day.sessionsStarted > 0).length,
      bestDayFocusMs: every.reduce((best, day) => Math.max(best, day.focusMs), 0)
    }
  };
}
function buildScopeSummary(input) {
  const { from, to } = scopeBounds(input.scope, input.anchor);
  const dates = localDateRange(from, to);
  const window = dates.map((date2) => input.rollups[date2] ?? emptyRollup(date2));
  const present = dates.map((date2) => input.rollups[date2]).filter((day) => day !== void 0);
  const momentum = input.scope === "day" ? momentumThrough(input.rollups, to) : input.scope === "week" ? weekMomentum(input.rollups, from) : monthMomentum(input.rollups, from);
  const recentDates = localDateRange(addLocalDays(to, -29), to);
  const recent = recentDates.map((date2) => input.rollups[date2]).filter((day) => day !== void 0);
  return {
    scope: input.scope,
    anchor: input.anchor,
    label: scopeLabel(input.scope, from, to),
    momentum,
    band: bandFor(momentum),
    sessionsStarted: present.reduce((sum, day) => sum + day.sessionsStarted, 0),
    focusMs: present.reduce((sum, day) => sum + day.focusMs, 0),
    threadsCompleted: present.reduce((sum, day) => sum + day.threadsCompleted, 0),
    detail: buildDetail(present, input.rollups),
    trend: buildTrend(input, from, to),
    insight: pickInsight({ window, recent, threads: input.threads, today: input.today }),
    distractions: buildDistractionStats(present),
    activeDays: activeDays(input.rollups, localDateRange(addLocalDays(to, -13), to)),
    atLatest: to >= input.today
  };
}
class AnalyticsService {
  constructor(db, onChanged) {
    this.db = db;
    this.onChanged = onChanged;
  }
  rollups = { version: 2, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), days: {} };
  persistTimer = null;
  get file() {
    return path.join(this.db.root, "analytics", "rollups.json");
  }
  async load() {
    const raw = await readFileIfExists(this.file);
    if (!raw) {
      await this.rebuild();
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed.version !== 2 || typeof parsed.days !== "object") throw new Error("stale rollups");
      this.rollups = parsed;
    } catch {
      await this.rebuild();
    }
  }
  /** Settings → Repair data, and the boot fallback. Full scan of every session and thread. */
  async rebuild() {
    const sessions = await this.db.sessions.all();
    const threads = await this.everyThread();
    const timezone = this.db.clock.timezone();
    const days = {};
    for (const localDate2 of datesTouched(sessions, threads)) {
      days[localDate2] = computeDayRollup(localDate2, sessions, threads, timezone);
    }
    this.rollups = { version: 2, updatedAt: (/* @__PURE__ */ new Date()).toISOString(), days };
    await this.persist();
    this.onChanged();
  }
  /**
   * Recomputes exactly the days an event touched. Called after every mutation, which is what
   * makes Analytics live without a refresh button.
   */
  async touchDays(localDates) {
    const unique = [...new Set(localDates)].filter(Boolean);
    if (unique.length === 0) return;
    const from = unique[0];
    const to = unique[unique.length - 1];
    const sessions = await this.db.sessions.inLocalDateRange(from, to);
    const threads = await this.db.threads.list();
    const timezone = this.db.clock.timezone();
    for (const localDate2 of unique) {
      const rollup = computeDayRollup(localDate2, sessions, threads, timezone);
      if (rollup.sessionsStarted === 0 && rollup.stepsCompleted === 0 && rollup.threadsCompleted === 0) {
        delete this.rollups.days[localDate2];
      } else {
        this.rollups.days[localDate2] = rollup;
      }
    }
    this.rollups.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    this.schedulePersist();
    this.onChanged();
  }
  async summary(scope, anchor) {
    return buildScopeSummary({
      scope,
      anchor,
      rollups: this.rollups.days,
      threads: await this.db.threads.list(),
      today: this.db.clock.today()
    });
  }
  snapshot() {
    return this.rollups;
  }
  async flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    await this.persist();
  }
  schedulePersist() {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persist();
    }, 1e3);
    this.persistTimer.unref?.();
  }
  async persist() {
    await atomicWriteFile(this.file, serialise(this.rollups));
  }
  /** Active plus archived, deduped — a done thread can legitimately appear in both listings. */
  async everyThread() {
    const byId = /* @__PURE__ */ new Map();
    for (const thread of await this.db.threads.list()) byId.set(thread.id, thread);
    const archived = await this.db.threads.donePage({ limit: Number.MAX_SAFE_INTEGER });
    for (const thread of archived.threads) byId.set(thread.id, thread);
    return [...byId.values()];
  }
}
const MAX_FULL_DAYS = 62;
const MAX_SUMMARY_DAYS = 366;
function maxDaysFor(detail) {
  return detail === "summary" ? MAX_SUMMARY_DAYS : MAX_FULL_DAYS;
}
function detailFor(scope) {
  return scope === "month" ? "summary" : "full";
}
function buildCalendar(sources, detail = "full") {
  const dates = localDateRange(sources.from, sources.to);
  const live = (rows) => rows.filter((row) => !row.deletedAt);
  const plansByDate = byKey(live(sources.plans), (plan) => plan.localDate);
  const daysByDate = byKey(live(sources.days), (day) => day.localDate);
  const sessionsByDate = groupBy(live(sources.sessions), (session) => session.localDate);
  const sitsByDate = groupBy(live(sources.sits), (sit) => sit.localDate);
  const titles = new Map(sources.threads.map((thread) => [thread.id, thread.title]));
  const days = dates.map((localDate2) => {
    const plan = plansByDate.get(localDate2) ?? null;
    const sessions = sessionsByDate.get(localDate2) ?? [];
    const sits = sitsByDate.get(localDate2) ?? [];
    const todos = daysByDate.get(localDate2)?.todos ?? [];
    const entries = entriesFor(localDate2, plan, sessions, sits, titles, sources.timezone);
    return {
      localDate: localDate2,
      // The plan's own week key is authoritative when it has one — it is what the run filed the
      // day under, and re-deriving it would disagree for a plan generated across a boundary.
      weekKey: plan?.weekKey || weekKeyOf(localDate2),
      plan: plan ? {
        generatedAt: plan.generatedAt,
        wakeTime: plan.wakeTime,
        startTime: plan.startTime,
        endTime: plan.endTime,
        headline: plan.headline
      } : null,
      ...detail === "full" ? { entries } : {},
      summary: summarise(entries, todos, plan !== null)
    };
  });
  return {
    from: sources.from,
    to: sources.to,
    timezone: sources.timezone,
    detail,
    weeks: weeksFor(dates, live(sources.weekPlans), live(sources.goals)),
    days
  };
}
function entriesFor(localDate2, plan, sessions, sits, titles, timezone) {
  const entries = [];
  const blocks = plan?.blocks ?? [];
  const spentByBlock = attribute(blocks, sessions, timezone);
  for (const block of blocks) {
    const spent = spentByBlock.get(block.id);
    entries.push({
      id: `plan:${localDate2}:${block.id}`,
      source: "plan",
      localDate: localDate2,
      start: block.start,
      end: block.end,
      kind: block.kind,
      title: block.title,
      ...block.why ? { why: block.why } : {},
      ...block.threadId ? { threadId: block.threadId } : {},
      ...block.todoId ? { todoId: block.todoId } : {},
      ...block.goalId ? { goalId: block.goalId } : {},
      ...block.promoted ? { promoted: true } : {},
      // Only a real session promotes a block past `planned`. Nothing here consults the clock.
      status: spent ? "done" : "planned",
      ...spent ? { actualMs: spent } : {}
    });
  }
  for (const session of sessions) {
    const start = wallClock(session.startedAt, timezone);
    entries.push({
      id: `session:${session.id}`,
      source: "session",
      localDate: localDate2,
      start,
      end: runningEnd(session.startedAt, session.endedAt, session.activeMs, timezone),
      kind: "session",
      title: session.threadId && titles.get(session.threadId)?.trim() || "Focus",
      ...session.threadId ? { threadId: session.threadId } : {},
      status: session.endedAt ? "done" : "running",
      actualMs: Math.max(0, session.activeMs),
      startedAt: session.startedAt,
      ...session.endedAt ? { endedAt: session.endedAt } : {}
    });
  }
  for (const sit of sits) {
    const start = wallClock(sit.startedAt, timezone);
    entries.push({
      id: `sit:${sit.id}`,
      source: "sit",
      localDate: localDate2,
      start,
      end: runningEnd(sit.startedAt, sit.endedAt, sit.actualMs, timezone),
      kind: "sit",
      title: "Sit",
      status: sit.endedAt ? "done" : "running",
      actualMs: Math.max(0, sit.actualMs),
      startedAt: sit.startedAt,
      ...sit.endedAt ? { endedAt: sit.endedAt } : {}
    });
  }
  return entries.sort(
    (a, b) => toMinutes$1(a.start) - toMinutes$1(b.start) || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source] || a.id.localeCompare(b.id)
  );
}
const SOURCE_ORDER = { plan: 0, session: 1, sit: 2 };
function attribute(blocks, sessions, timezone) {
  const spent = /* @__PURE__ */ new Map();
  if (!blocks.length) return spent;
  const byThread = /* @__PURE__ */ new Map();
  for (const block of blocks) {
    if (!block.threadId) continue;
    const list = byThread.get(block.threadId);
    if (list) list.push(block);
    else byThread.set(block.threadId, [block]);
  }
  for (const session of sessions) {
    if (!session.threadId) continue;
    const candidates = byThread.get(session.threadId);
    if (!candidates?.length) continue;
    const at = toMinutes$1(wallClock(session.startedAt, timezone));
    const winner = candidates.reduce(
      (best, block) => Math.abs(toMinutes$1(block.start) - at) < Math.abs(toMinutes$1(best.start) - at) ? block : best
    );
    spent.set(winner.id, (spent.get(winner.id) ?? 0) + Math.max(0, session.activeMs));
  }
  return spent;
}
const WORK_KINDS = /* @__PURE__ */ new Set(["focus", "admin"]);
function summarise(entries, todos, planned) {
  let plannedMs = 0;
  let focusMs = 0;
  let sitMs = 0;
  let blocks = 0;
  let blocksDone = 0;
  let sessions = 0;
  for (const entry of entries) {
    if (entry.source === "plan") {
      blocks += 1;
      if (WORK_KINDS.has(entry.kind)) {
        plannedMs += spanMs(entry.start, entry.end);
        if (entry.status === "done") blocksDone += 1;
      }
    } else if (entry.source === "session") {
      sessions += 1;
      focusMs += entry.actualMs ?? 0;
    } else {
      sitMs += entry.actualMs ?? 0;
    }
  }
  return {
    plannedMs,
    focusMs,
    sitMs,
    blocks,
    blocksDone,
    sessions,
    todosOpen: todos.filter((todo) => !todo.done).length,
    todosDone: todos.filter((todo) => todo.done).length,
    planned
  };
}
function weeksFor(dates, weekPlans, goals) {
  const keys = [];
  for (const date2 of dates) {
    const key = weekKeyOf(date2);
    if (!keys.includes(key)) keys.push(key);
  }
  const runs = byKey(weekPlans, (week) => week.weekKey);
  const goalsByWeek = groupBy(goals, (goal) => goal.weekKey);
  return keys.map((weekKey2) => {
    const run = runs.get(weekKey2);
    return {
      weekKey: weekKey2,
      from: run?.fromDate ?? "",
      to: run?.toDate ?? "",
      generatedAt: run?.generatedAt ?? null,
      headline: run?.headline ?? "",
      deferred: (run?.deferred ?? []).filter((line) => typeof line === "string" && line.trim()),
      model: run?.model || null,
      goals: (goalsByWeek.get(weekKey2) ?? []).map((goal) => ({
        id: goal.id,
        title: goal.title,
        done: goal.done,
        order: goal.order ?? null
      })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id))
    };
  });
}
function wallClock(iso2, timezone) {
  const at = new Date(iso2);
  if (Number.isNaN(at.getTime())) return "00:00";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    }).format(at);
  } catch {
    return iso2.slice(11, 16);
  }
}
function runningEnd(startedAt, endedAt, accruedMs, timezone) {
  if (endedAt) return wallClock(endedAt, timezone);
  const accrued = new Date(new Date(startedAt).getTime() + Math.max(0, accruedMs));
  return Number.isNaN(accrued.getTime()) ? wallClock(startedAt, timezone) : wallClock(accrued.toISOString(), timezone);
}
function toMinutes$1(time) {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
function spanMs(start, end) {
  return Math.max(0, toMinutes$1(end) - toMinutes$1(start)) * 6e4;
}
function byKey(rows, key) {
  const out = /* @__PURE__ */ new Map();
  for (const row of rows) out.set(key(row), row);
  return out;
}
function groupBy(rows, key) {
  const out = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
  /** The token is gone or expired — the only condition that signs a user out. */
  get isUnauthorized() {
    return this.status === 401;
  }
}
class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = "NetworkError";
  }
}
const TIMEOUT_MS = 15e3;
const SYNC_TIMEOUT_MS = 6e4;
const PLAN_TIMEOUT_MS = 2e4;
const CALENDAR_TIMEOUT_MS = 3e4;
const HEALTH_TIMEOUT_MS = 5e3;
class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }
  setBaseUrl(url) {
    this.baseUrl = normaliseUrl(url);
  }
  get url() {
    return this.baseUrl;
  }
  register(email, password, timezone) {
    return this.request("POST", "/auth/register", {
      body: { email, password, timezone }
    });
  }
  login(email, password) {
    return this.request("POST", "/auth/login", {
      body: { email, password }
    });
  }
  /**
   * Step one of both signing up and resetting a password. Answers 202 and the same body no
   * matter what, so there is nothing here to branch on — see `EmailStartResult`.
   */
  emailStart(email) {
    return this.request("POST", "/auth/email/start", {
      body: { email }
    });
  }
  /** Step two. `purpose` tells the caller which screen comes next. */
  emailVerify(email, code) {
    return this.request("POST", "/auth/email/verify", {
      body: { email, code }
    });
  }
  /**
   * Step three, and the one that creates the account — the server writes no user row until a
   * code has come back from the mailbox. On a reset it also ends every other session.
   */
  setPassword(ticket, password, timezone) {
    return this.request("POST", "/auth/password", {
      body: { ticket, password, timezone }
    });
  }
  logout(token) {
    return this.request("POST", "/auth/logout", { token });
  }
  me(token) {
    return this.request("GET", "/auth/me", { token });
  }
  deleteAccount(token) {
    return this.request("DELETE", "/auth/account", { token });
  }
  // ------------------------------------------------------------------- sync
  /** Everything past the cursor, tombstones included. `since=0` is a full first sync. */
  pull(token, since) {
    return this.request("GET", `/sync?since=${since}`, { token });
  }
  push(token, body) {
    return this.request("POST", "/sync", { token, body });
  }
  // ---------------------------------------------------------------- planner
  /**
   * Ask the server to start planning the rest of the week.
   *
   * The key lives there, not here — one key, one bill, one prompt, and a phone that cannot hold
   * a key at all. This returns as soon as the run starts; the plan itself arrives through sync,
   * on every signed-in device rather than only this one. Poll `planStatus` to know when to stop
   * saying "planning…".
   */
  planWeek(token, body) {
    return this.request("POST", "/plan/week", { token, body });
  }
  /** Replan the rest of today, from `fromTime`. Same 202-then-sync contract as the week. */
  planDay(token, body) {
    return this.request("POST", "/plan/day", { token, body });
  }
  /** The coach. Same 202-then-sync contract; poll `planStatus` like any other run. */
  insight(token, body) {
    return this.request("POST", "/insight", {
      token,
      body
    });
  }
  planStatus(token) {
    return this.request("GET", "/plan/status", { token });
  }
  /**
   * Is the server up? The one call here that carries no token and needs no account — being
   * signed out is not the same as being offline, and the answer is the same either way.
   */
  health() {
    return this.request("GET", "/health");
  }
  // --------------------------------------------------------------- calendar
  /**
   * The server's copy of a stretch of calendar.
   *
   * A read, and one nothing on screen waits for — `CalendarService` renders the local build
   * first and lets this replace it when it arrives. That is why it is safe for this to be the
   * one call that can quietly do nothing.
   *
   * `detail=summary` drops the per-day entry lists and keeps the counts, which is what a month
   * grid renders. Asking for `full` over a month is a 400 from the server rather than a slow
   * success, so the caller clamps the range before it gets here.
   */
  calendar(token, from, to, detail = "full") {
    const query = new URLSearchParams({ from, to, detail });
    return this.request("GET", `/calendar?${query.toString()}`, { token });
  }
  async request(method, path2, options = {}) {
    const headers = {};
    if (options.body !== void 0) headers["content-type"] = "application/json";
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    let response;
    try {
      response = await fetch(`${this.baseUrl}${path2}`, {
        method,
        headers,
        body: options.body === void 0 ? void 0 : JSON.stringify(options.body),
        signal: AbortSignal.timeout(timeoutFor(path2))
      });
    } catch (error) {
      throw new NetworkError(unreachable(this.baseUrl, error));
    }
    if (!response.ok) {
      throw new ApiError(response.status, await describe$1(response, path2));
    }
    const text = await response.text();
    if (!text) return void 0;
    try {
      return JSON.parse(text);
    } catch {
      throw new ApiError(response.status, "The server sent a reply this app could not read.");
    }
  }
}
function timeoutFor(path2) {
  if (path2.startsWith("/plan")) return PLAN_TIMEOUT_MS;
  if (path2.startsWith("/sync")) return SYNC_TIMEOUT_MS;
  if (path2.startsWith("/health")) return HEALTH_TIMEOUT_MS;
  if (path2.startsWith("/calendar")) return CALENDAR_TIMEOUT_MS;
  return TIMEOUT_MS;
}
function normaliseUrl(url) {
  return url.trim().replace(/\/+$/, "");
}
function unreachable(baseUrl, error) {
  const timedOut = error instanceof Error && error.name === "TimeoutError";
  const host = hostOf(baseUrl);
  return timedOut ? `${host} did not answer in time. Your work is saved locally either way.` : `Could not reach ${host}. Check your connection — your work is saved locally either way.`;
}
function hostOf(baseUrl) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
async function describe$1(response, path2) {
  const fromServer = await serverMessage(response);
  switch (response.status) {
    case 400:
      return fromServer ?? "That does not look right — check the email and password.";
    case 401:
      return path2 === "/auth/login" ? "Email or password is wrong." : "Your session has expired. Sign in again.";
    case 409:
      return "That email already has an account. Sign in instead.";
    case 413:
      return "That batch was too large for the server. It will be sent in smaller pieces.";
    case 429:
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      if (response.status >= 500) {
        return "The server is having trouble. Nothing was lost — try again shortly.";
      }
      return fromServer ?? `The server refused that (${response.status}).`;
  }
}
async function serverMessage(response) {
  try {
    const body = await response.json();
    if (typeof body.error !== "string" || !body.error) return null;
    return body.error.charAt(0).toUpperCase() + body.error.slice(1);
  } catch {
    return null;
  }
}
class CalendarService {
  constructor(db, auth) {
    this.db = db;
    this.auth = auth;
  }
  /**
   * The local answer, always available, never blocked on anything.
   *
   * This is what a view renders on first paint and what it keeps if the network is not there.
   */
  async local(request) {
    const { from, to } = clampRange(request);
    const detail = detailFor(request.scope);
    const settings = this.db.settings.get();
    const weekKeys = weekKeysBetween(from, to);
    const [plans, sessions, days, goals, threads, weekPlans, sits] = await Promise.all([
      this.db.plans.range(from, to),
      this.db.sessions.inLocalDateRange(from, to),
      this.db.days.range(from, to),
      this.db.goals.list(),
      this.db.threads.list(),
      this.db.plans.weeksFor(weekKeys),
      this.sits(from, to)
    ]);
    return buildCalendar(
      {
        from,
        to,
        timezone: settings.timezone,
        plans,
        sessions,
        sits,
        days,
        weekPlans,
        goals: goals.filter((goal) => weekKeys.includes(goal.weekKey)),
        // Every thread, done ones included: a session on a finished thread still needs its
        // title, and `activeList()` would render it as a bare "Focus".
        threads: threads.map((thread) => ({ id: thread.id, title: thread.title }))
      },
      detail
    );
  }
  /**
   * The server's copy, or null.
   *
   * Null every time it cannot be had — signed out, offline, rate limited, anything. There is no
   * error path here on purpose: the caller already holds a complete local answer, so a failure
   * to reach the server is not a failure to produce a calendar, and treating it as one would
   * put an error banner over a week that is perfectly readable.
   */
  async remote(request) {
    const token = this.auth.currentToken();
    if (!token) return null;
    const { from, to } = clampRange(request);
    try {
      const calendar = await this.auth.api.calendar(
        token,
        from,
        to,
        detailFor(request.scope)
      );
      return { calendar, source: "server" };
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        await this.auth.handleUnauthorized();
      }
      return null;
    }
  }
  /**
   * Sits, read straight off the collection.
   *
   * There is no `MindfulRepo`: sits are recorded on the phone and this app only ever receives
   * them through sync, so nothing here has ever needed to write one. Reading them for the
   * calendar does not change that, and inventing a repository for one filtered read would.
   */
  async sits(from, to) {
    const all = await this.db.store.collection(COLLECTION.mindful).all();
    return all.filter(
      (sit) => !sit.deletedAt && sit.localDate >= from && sit.localDate <= to
    );
  }
}
function weekKeysBetween(from, to) {
  const keys = [];
  for (let date2 = from; date2 <= to; date2 = addLocalDays(date2, 7)) {
    const key = weekKeyOf(date2);
    if (!keys.includes(key)) keys.push(key);
  }
  const last = weekKeyOf(to);
  if (to >= from && !keys.includes(last)) keys.push(last);
  return keys;
}
function clampRange(request) {
  const detail = detailFor(request.scope);
  const limit = maxDaysFor(detail);
  const from = request.from <= request.to ? request.from : request.to;
  const to = request.from <= request.to ? request.to : request.from;
  const span = diffLocalDays(from, to) + 1;
  return { from, to: span > limit ? addLocalDays(from, limit - 1) : to, detail };
}
const STALE_MINUTES = 5;
class NowService {
  constructor(db, sessions, onNudge) {
    this.db = db;
    this.sessions = sessions;
    this.onNudge = onNudge;
  }
  timer = null;
  lastMinute = null;
  start() {
    if (this.timer) return;
    this.lastMinute = this.minuteOfDay();
    this.timer = setInterval(() => void this.tick().catch(() => {
    }), 2e4);
    this.timer.unref?.();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  async tick() {
    const settings = this.db.settings.get();
    if (!settings.nudgesEnabled) return;
    const now = this.minuteOfDay();
    let last = this.lastMinute ?? now;
    this.lastMinute = now;
    if (now === last) return;
    if (minutesBetween(last, now) > STALE_MINUTES) last = (now - STALE_MINUTES + 1440) % 1440;
    const plan = await this.db.plans.get(this.db.clock.today());
    if (!plan) return;
    if (await this.sessions.state()) return;
    const run = await this.db.dayRuns.get(plan.localDate);
    for (const entry of effectiveBlocks(plan, run)) {
      if (entry.skipped || entry.block.kind === "buffer") continue;
      if (!crossed(last, now, entry.start)) continue;
      this.onNudge({ localDate: plan.localDate, block: entry.block });
    }
  }
  minuteOfDay() {
    const formatted = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: this.db.settings.get().timezone
    }).format(/* @__PURE__ */ new Date());
    return toMinutes(formatted);
  }
}
function crossed(last, now, target) {
  if (last === now) return false;
  if (last < now) return target > last && target <= now;
  return target > last || target <= now;
}
function minutesBetween(last, now) {
  return (now - last + 1440) % 1440;
}
function toMinutes(time) {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}
const POLL_MS = 3e3;
const POLL_TIMEOUT_MS = 5 * 6e4;
class PlannerError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlannerError";
  }
}
class PlannerService {
  constructor(db, auth, sync = null) {
    this.db = db;
    this.auth = auth;
    this.sync = sync;
  }
  /**
   * Guards against a double-tapped button. The server refuses a concurrent run too, but a
   * request that never leaves is cheaper than one that comes back 409.
   */
  running = false;
  attachSync(engine) {
    this.sync = engine;
  }
  get isRunning() {
    return this.running;
  }
  /**
   * Plan the days that are left in this week.
   *
   * How many days that is falls out of the date: pressing this on Monday plans seven days,
   * pressing it on Friday plans three. The server does that arithmetic from `localDate`, because
   * only the client knows what day it is where the user is.
   */
  async generate(input = {}) {
    const token = this.requireToken();
    if (this.running) {
      throw new PlannerError("A plan is already being generated. Give it a moment.");
    }
    const settings = this.db.settings.get();
    const body = {
      localDate: input.localDate ?? this.db.clock.today(),
      wakeTime: input.wakeTime ?? settings.wakeTime,
      startTime: input.startTime ?? settings.dayStartTime,
      endTime: input.endTime ?? settings.dayEndTime,
      ...input.note?.trim() ? { note: input.note.trim() } : {},
      model: settings.plannerModel,
      effort: settings.plannerEffort
    };
    this.running = true;
    try {
      await this.sync?.sync().catch(() => void 0);
      const accepted = await this.auth.api.planWeek(token, body);
      void this.awaitRun(accepted);
      return accepted;
    } catch (error) {
      this.running = false;
      throw new PlannerError(describe(error));
    }
  }
  /**
   * Replan the rest of today, from the clock's "now". The "life happened" button: what already
   * happened stays as it was, pinned blocks stay where they are, and only the hours still
   * ahead are reshaped. Same acknowledge-poll-sync flow as the week.
   */
  async generateDay(input) {
    const token = this.requireToken();
    if (this.running) {
      throw new PlannerError("A plan is already being generated. Give it a moment.");
    }
    const settings = this.db.settings.get();
    const body = {
      localDate: input.localDate ?? this.db.clock.today(),
      fromTime: clockNow(settings.timezone),
      ...input.note?.trim() ? { note: input.note.trim() } : {},
      model: settings.plannerModel,
      effort: settings.plannerEffort
    };
    this.running = true;
    try {
      await this.sync?.sync().catch(() => void 0);
      const accepted = await this.auth.api.planDay(token, body);
      void this.awaitRun(accepted);
      return accepted;
    } catch (error) {
      this.running = false;
      throw new PlannerError(describe(error));
    }
  }
  /**
   * Ask the coach to read a day or a week. Lives on the planner service because it *is* the
   * same machine — one paid run at a time, sync first so the server reads what this device
   * just wrote, poll the shared status, and let the result arrive as a record.
   */
  async generateInsight(scope) {
    const token = this.requireToken();
    if (this.running) {
      throw new PlannerError("Another generation is already running. Give it a moment.");
    }
    this.running = true;
    try {
      await this.sync?.sync().catch(() => void 0);
      const accepted = await this.auth.api.insight(token, {
        localDate: this.db.clock.today(),
        scope
      });
      void this.awaitRun({ weekKey: accepted.periodKey, startedAt: accepted.startedAt, dates: [] });
      return accepted;
    } catch (error) {
      this.running = false;
      throw new PlannerError(describe(error));
    }
  }
  /**
   * Wait for the run, then sync so the result lands locally.
   *
   * Failure here is reported through `onFinished` rather than thrown: nobody is holding this
   * promise. The alternative — an unhandled rejection somewhere in the main process — would take
   * the error somewhere no user ever sees it.
   */
  async awaitRun(accepted) {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    try {
      while (Date.now() < deadline) {
        await delay(POLL_MS);
        const token = this.auth.currentToken();
        if (!token) throw new PlannerError("Signed out while the plan was being generated.");
        let state;
        try {
          state = await this.auth.api.planStatus(token);
        } catch {
          continue;
        }
        if (state.status === "failed") {
          throw new PlannerError(state.error ?? "The plan could not be generated.");
        }
        if (state.status !== "running") {
          await this.sync?.sync();
          this.onFinished?.(null, accepted.weekKey);
          return;
        }
      }
      throw new PlannerError(
        "The plan is taking much longer than usual. It may still arrive — the next sync will bring it."
      );
    } catch (error) {
      this.onFinished?.(error instanceof Error ? error.message : describe(error), accepted.weekKey);
    } finally {
      this.running = false;
    }
  }
  /** Set by AppContext, so a finished run can reach the windows. */
  onFinished = null;
  requireToken() {
    const token = this.auth.currentToken();
    if (!token) {
      throw new PlannerError(
        "Planning happens on the server, so this needs you signed in. Sign in from Settings and try again."
      );
    }
    return token;
  }
}
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function describe(error) {
  if (error instanceof NetworkError) {
    return "Could not reach the server to plan. Nothing else in the app needs it — try again when you are back online.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "Your session expired. Sign in again from Settings, then plan.";
    }
    if (error.status === 429) {
      return "That is a lot of plans in one hour. Wait a little and try again.";
    }
    if (error.status === 503) {
      return "This server has no planning key configured, so it cannot generate a plan.";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "The plan could not be generated.";
}
function clockNow(timezone) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone
  }).format(/* @__PURE__ */ new Date());
}
const MIN_PASSWORD_LENGTH = 10;
const DEFAULT_SERVER_URL = "https://api.adhd.yatishgautam.com";
class AuthService {
  constructor(root, onChanged) {
    this.root = root;
    this.onChanged = onChanged;
    this.api = new ApiClient(normaliseUrl(process.env.ADHD_API_URL || DEFAULT_SERVER_URL));
  }
  account = null;
  token = null;
  offline = false;
  busy = false;
  /** The engine pushes and pulls with the same client, so it stays pointed at the same host. */
  api;
  get file() {
    return path.join(this.root, "account.json");
  }
  state() {
    return {
      account: this.account,
      serverUrl: this.api.url,
      offline: this.offline,
      busy: this.busy
    };
  }
  /** For the sync engine. Null means there is nothing to push with. */
  currentToken() {
    return this.token;
  }
  /**
   * The token was rejected mid-sync. Signing out is the honest response — the alternative is
   * an app that looks signed in and quietly syncs nothing.
   */
  async handleUnauthorized() {
    if (!this.token) return;
    await this.clear();
    this.emit();
  }
  // ------------------------------------------------------------------- boot
  async load() {
    const raw = await readFileIfExists(this.file);
    if (raw === null) return;
    let stored;
    try {
      stored = JSON.parse(raw);
    } catch {
      console.warn("[auth] account.json unreadable — starting signed out");
      return;
    }
    if (stored.serverUrl && !process.env.ADHD_API_URL) {
      this.api.setBaseUrl(stored.serverUrl);
    }
    this.account = stored.account ?? null;
    this.token = stored.token ? decrypt(stored.token) : null;
    if (this.account && !this.token) {
      this.account = null;
    }
  }
  /**
   * Confirms the stored token is still good, and refreshes the profile. Fire-and-forget from
   * boot: it must never be awaited on the path to a visible window.
   */
  async revalidate() {
    if (!this.token) return;
    try {
      this.account = await this.api.me(this.token);
      this.offline = false;
      await this.persist();
    } catch (error) {
      if (error instanceof ApiError && error.isUnauthorized) {
        await this.clear();
      } else {
        this.offline = true;
      }
    }
    this.emit();
  }
  // ---------------------------------------------------------------- actions
  async register(email, password, displayName) {
    const name = displayName?.trim() || null;
    const state = await this.authenticate(
      () => this.api.register(email.trim(), password, systemTimezone()),
      name
    );
    if (name && this.token) {
      try {
        await this.api.push(this.token, {
          profile: {
            displayName: name,
            timezone: systemTimezone(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
      } catch (error) {
        console.warn("[auth] the display name will sync on the next round trip", error);
      }
    }
    return state;
  }
  async login(email, password) {
    return this.authenticate(() => this.api.login(email.trim(), password));
  }
  // ------------------------------------------------- signing up by email code
  /**
   * Asks the server to mail a code. Signing up and recovering a forgotten password are the
   * same call: the server looks the address up and decides which mail to send, and tells the
   * person in their inbox rather than telling us here.
   *
   * Nothing about the account changes, so this does not emit a new `AuthState` — it is the one
   * account call whose answer is not who you are.
   */
  async emailStart(email) {
    this.setBusy(true);
    try {
      return await this.api.emailStart(email.trim());
    } finally {
      this.setBusy(false);
    }
  }
  /** Trades six digits for a one-shot ticket. Still not a sign-in — no token exists yet. */
  async emailVerify(email, code) {
    this.setBusy(true);
    try {
      return await this.api.emailVerify(email.trim(), code);
    } finally {
      this.setBusy(false);
    }
  }
  /**
   * Spends the ticket and signs in with what comes back. This is where an account is actually
   * created, so the display-name push mirrors `register` exactly — best effort, because an
   * account that exists without a name yet beats a sign-up that fails on its last step.
   *
   * On a reset there is no name to send and none is sent; the server has just ended every
   * other session for the account, which is the point of resetting.
   */
  async setPassword(ticket, password, displayName) {
    const name = displayName?.trim() || null;
    const state = await this.authenticate(
      () => this.api.setPassword(ticket, password, systemTimezone()),
      name
    );
    if (name && this.token) {
      try {
        await this.api.push(this.token, {
          profile: {
            displayName: name,
            timezone: systemTimezone(),
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        });
      } catch (error) {
        console.warn("[auth] the display name will sync on the next round trip", error);
      }
    }
    return state;
  }
  /**
   * Tells the server to burn the token, then forgets it locally either way. A logout that
   * fails to reach the server must still log you out of this machine — that is the whole
   * point of pressing it.
   */
  async logout() {
    const token = this.token;
    await this.clear();
    this.emit();
    if (token) {
      try {
        await this.api.logout(token);
      } catch {
      }
    }
    return this.state();
  }
  /** Irreversible, and the server does the cascade. Local data is untouched and still yours. */
  async deleteAccount() {
    if (!this.token) return this.state();
    this.setBusy(true);
    try {
      await this.api.deleteAccount(this.token);
      await this.clear();
      return this.state();
    } finally {
      this.setBusy(false);
    }
  }
  /**
   * Ask the server whether it is there, and time how long it took to say so.
   *
   * Deliberately leaves `offline` alone. That flag is what the token check and sync found, and
   * a probe of an unauthenticated endpoint proves nothing either way about a session — a green
   * light here with an expired token is a true statement about the server, and quietly
   * rewriting the account's state from a diagnostic button would make the two disagree.
   */
  async checkHealth() {
    const host = hostOf(this.api.url);
    const started = Date.now();
    try {
      const body = await this.api.health();
      const online = body?.ok !== false;
      return {
        online,
        host,
        latencyMs: Date.now() - started,
        message: online ? null : `${host} answered, but says it is not healthy.`
      };
    } catch (error) {
      return {
        online: false,
        host,
        latencyMs: null,
        message: error instanceof Error ? error.message : `Could not reach ${host}.`
      };
    }
  }
  async setServerUrl(url) {
    const next = normaliseUrl(url) || DEFAULT_SERVER_URL;
    if (next === this.api.url) return this.state();
    await this.clear();
    this.api.setBaseUrl(next);
    await this.persist();
    this.emit();
    return this.state();
  }
  // ---------------------------------------------------------------- private
  async authenticate(call, displayName = null) {
    this.setBusy(true);
    try {
      const result = await call();
      this.token = result.token;
      this.account = {
        id: result.user.id,
        email: result.user.email,
        displayName,
        timezone: systemTimezone()
      };
      this.offline = false;
      await this.persist();
      return this.state();
    } finally {
      this.setBusy(false);
    }
  }
  async clear() {
    this.account = null;
    this.token = null;
    this.offline = false;
    await this.persist();
  }
  async persist() {
    const encrypted = this.token ? encrypt(this.token) : null;
    const stored = {
      version: 1,
      serverUrl: this.api.url,
      // Remembering who you are without being able to prove it just produces a signed-in
      // shell that cannot sync, so the pair is written together or not at all.
      account: encrypted ? this.account : null,
      ...encrypted ? { token: encrypted } : {}
    };
    await atomicWriteFile(this.file, `${JSON.stringify(stored, null, 2)}
`);
  }
  setBusy(busy) {
    this.busy = busy;
    this.emit();
  }
  emit() {
    this.onChanged(this.state());
  }
}
function encrypt(token) {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn("[auth] no OS keychain — the session will not survive a restart");
    return null;
  }
  return safeStorage.encryptString(token).toString("base64");
}
function decrypt(stored) {
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(stored, "base64"));
  } catch {
    console.warn("[auth] stored session could not be decrypted — signing out");
    return null;
  }
}
function threadOut(thread) {
  return {
    id: thread.id,
    title: thread.title,
    notes: thread.notes ?? "",
    status: thread.status,
    waitingOn: thread.waitingOn ?? null,
    link: thread.link ?? null,
    order: thread.order ?? null,
    steps: thread.steps ?? [],
    createdAt: iso(thread.createdAt),
    completedAt: thread.completedAt ? iso(thread.completedAt) : null,
    completedLocalDate: thread.completedLocalDate ?? null,
    totalFocusMs: thread.totalFocusMs ?? 0,
    sessionCount: thread.sessionCount ?? 0,
    distractionCount: thread.distractionCount ?? 0,
    archived: thread.archived ?? false,
    updatedAt: iso(thread.updatedAt),
    deletedAt: thread.deletedAt ? iso(thread.deletedAt) : null
  };
}
function dayOut(day) {
  return {
    localDate: day.localDate,
    createdAt: iso(day.createdAt),
    now: day.now ?? null,
    note: day.note ?? null,
    todos: day.todos ?? [],
    blockers: day.blockers ?? [],
    log: day.log ?? [],
    thoughts: day.thoughts ?? [],
    intentThreadIds: day.intentThreadIds ?? [],
    loggedThreadIds: day.loggedThreadIds ?? [],
    // A day written before sync existed has no updatedAt. Sending its createdAt rather than
    // "now" is the honest answer: it says the day is old, so a newer copy on another device
    // wins — which is what should happen.
    updatedAt: iso(day.updatedAt ?? day.createdAt),
    deletedAt: day.deletedAt ? iso(day.deletedAt) : null
  };
}
function sessionOut(session) {
  return {
    id: session.id,
    threadId: session.threadId,
    startedAt: iso(session.startedAt),
    endedAt: session.endedAt ? iso(session.endedAt) : null,
    localDate: session.localDate,
    plannedMs: session.plannedMs,
    activeMs: session.activeMs,
    grantedMs: session.grantedMs ?? 0,
    outcome: session.outcome,
    switchedToThreadId: session.switchedToThreadId ?? null,
    distractions: session.distractions ?? [],
    pauses: session.pauses ?? [],
    updatedAt: iso(session.updatedAt ?? session.endedAt ?? session.startedAt),
    deletedAt: session.deletedAt ? iso(session.deletedAt) : null
  };
}
function mindfulOut(sit) {
  return {
    id: sit.id,
    startedAt: iso(sit.startedAt),
    endedAt: sit.endedAt ? iso(sit.endedAt) : null,
    localDate: sit.localDate,
    plannedMs: sit.plannedMs,
    actualMs: sit.actualMs,
    completed: sit.completed,
    updatedAt: iso(sit.updatedAt ?? sit.startedAt),
    deletedAt: sit.deletedAt ? iso(sit.deletedAt) : null
  };
}
function goalOut(goal) {
  return {
    id: goal.id,
    title: goal.title,
    done: goal.done,
    context: goal.context ?? "",
    weekKey: goal.weekKey,
    // `boardOrder` on the wire; `order` here, same rename as threads.
    order: goal.order ?? null,
    createdAt: iso(goal.createdAt),
    updatedAt: iso(goal.updatedAt),
    completedAt: goal.completedAt ? iso(goal.completedAt) : null,
    completedLocalDate: goal.completedLocalDate ?? null,
    carriedFromWeek: goal.carriedFromWeek ?? null,
    deletedAt: goal.deletedAt ? iso(goal.deletedAt) : null
  };
}
function planOut(plan) {
  return {
    localDate: plan.localDate,
    weekKey: plan.weekKey ?? "",
    generatedAt: iso(plan.generatedAt),
    wakeTime: plan.wakeTime,
    startTime: plan.startTime,
    endTime: plan.endTime,
    blocks: plan.blocks ?? [],
    headline: plan.headline ?? "",
    updatedAt: iso(plan.updatedAt ?? plan.generatedAt),
    deletedAt: plan.deletedAt ? iso(plan.deletedAt) : null
  };
}
function weekPlanOut(plan) {
  return {
    weekKey: plan.weekKey,
    generatedAt: iso(plan.generatedAt),
    fromDate: plan.fromDate,
    toDate: plan.toDate,
    headline: plan.headline ?? "",
    deferred: plan.deferred ?? [],
    model: plan.model ?? "",
    // Round-tripped, never recomputed here. What a run cost is the server's number.
    usage: plan.usage ?? { inputTokens: 0, outputTokens: 0, costUsd: 0 },
    updatedAt: iso(plan.updatedAt ?? plan.generatedAt),
    deletedAt: plan.deletedAt ? iso(plan.deletedAt) : null
  };
}
function dayRunOut(run) {
  return {
    localDate: run.localDate,
    startedAt: iso(run.startedAt),
    endedAt: run.endedAt ? iso(run.endedAt) : null,
    shiftMs: run.shiftMs ?? 0,
    shiftFrom: run.shiftFrom ?? null,
    skippedBlockIds: run.skippedBlockIds ?? [],
    updatedAt: iso(run.updatedAt),
    deletedAt: run.deletedAt ? iso(run.deletedAt) : null
  };
}
function threadIn(raw) {
  const row = raw;
  const id = str(row.id);
  const createdAt = str(row.createdAt);
  const updatedAt = str(row.updatedAt);
  if (!id || !createdAt || !updatedAt) return null;
  return {
    id,
    title: str(row.title) ?? "Untitled",
    notes: str(row.notes) ?? "",
    status: threadStatus(str(row.status)),
    steps: Array.isArray(row.steps) ? row.steps : [],
    ...optional("waitingOn", str(row.waitingOn)),
    ...optional("link", str(row.link)),
    // `boardOrder` on the wire; `order` here. The column was renamed to avoid quoting a
    // reserved word in SQL, and the client kept the word that reads better.
    ...optional("order", num(row.boardOrder ?? row.order)),
    createdAt,
    updatedAt,
    ...optional("completedAt", str(row.completedAt)),
    ...optional("completedLocalDate", date(row.completedLocalDate)),
    totalFocusMs: num(row.totalFocusMs) ?? 0,
    sessionCount: num(row.sessionCount) ?? 0,
    distractionCount: num(row.distractionCount) ?? 0,
    archived: bool(row.archived),
    deletedAt: str(row.deletedAt) ?? null
  };
}
function dayIn(raw) {
  const row = raw;
  const localDate2 = date(row.localDate);
  const createdAt = str(row.createdAt);
  if (!localDate2 || !createdAt) return null;
  return {
    localDate: localDate2,
    createdAt,
    intentThreadIds: strings(row.intentThreadIds),
    todos: array(row.todos),
    thoughts: array(row.thoughts),
    loggedThreadIds: strings(row.loggedThreadIds),
    ...optional("note", str(row.note)),
    ...optional("now", str(row.nowText ?? row.now)),
    blockers: array(row.blockers),
    log: array(row.log),
    updatedAt: str(row.updatedAt) ?? createdAt,
    deletedAt: str(row.deletedAt) ?? null
  };
}
function sessionIn(raw) {
  const row = raw;
  const id = str(row.id);
  const startedAt = str(row.startedAt);
  const localDate2 = date(row.localDate);
  if (!id || !startedAt || !localDate2) return null;
  return {
    id,
    threadId: str(row.threadId) ?? "",
    startedAt,
    ...optional("endedAt", str(row.endedAt)),
    localDate: localDate2,
    plannedMs: num(row.plannedMs) ?? 0,
    activeMs: num(row.activeMs) ?? 0,
    grantedMs: num(row.grantedMs) ?? 0,
    outcome: outcome(str(row.outcome)),
    ...optional("switchedToThreadId", str(row.switchedToThreadId)),
    distractions: array(row.distractions),
    pauses: array(row.pauses),
    updatedAt: str(row.updatedAt) ?? startedAt,
    deletedAt: str(row.deletedAt) ?? null
  };
}
function mindfulIn(raw) {
  const row = raw;
  const id = str(row.id);
  const startedAt = str(row.startedAt);
  const localDate2 = date(row.localDate);
  if (!id || !startedAt || !localDate2) return null;
  return {
    id,
    startedAt,
    endedAt: str(row.endedAt) ?? null,
    localDate: localDate2,
    plannedMs: num(row.plannedMs) ?? 0,
    actualMs: num(row.actualMs) ?? 0,
    completed: bool(row.completed),
    updatedAt: str(row.updatedAt) ?? startedAt,
    deletedAt: str(row.deletedAt) ?? null
  };
}
function goalIn(raw) {
  const row = raw;
  const id = str(row.id);
  const weekKey2 = str(row.weekKey);
  const createdAt = str(row.createdAt);
  if (!id || !weekKey2 || !createdAt) return null;
  return {
    id,
    title: str(row.title) ?? "Untitled",
    done: bool(row.done),
    context: str(row.context) ?? "",
    weekKey: weekKey2,
    order: num(row.boardOrder ?? row.order) ?? 0,
    createdAt,
    updatedAt: str(row.updatedAt) ?? createdAt,
    ...optional("completedAt", str(row.completedAt)),
    ...optional("completedLocalDate", date(row.completedLocalDate)),
    ...optional("carriedFromWeek", str(row.carriedFromWeek)),
    deletedAt: str(row.deletedAt) ?? null
  };
}
function planIn(raw) {
  const row = raw;
  const localDate2 = date(row.localDate);
  const generatedAt = str(row.generatedAt);
  if (!localDate2 || !generatedAt) return null;
  return {
    localDate: localDate2,
    ...optional("weekKey", str(row.weekKey)),
    generatedAt,
    wakeTime: str(row.wakeTime) ?? "07:00",
    startTime: str(row.startTime) ?? "09:00",
    endTime: str(row.endTime) ?? "18:00",
    blocks: array(row.blocks),
    headline: str(row.headline) ?? "",
    updatedAt: str(row.updatedAt) ?? generatedAt,
    deletedAt: str(row.deletedAt) ?? null
  };
}
function weekPlanIn(raw) {
  const row = raw;
  const weekKey2 = str(row.weekKey);
  const generatedAt = str(row.generatedAt);
  if (!weekKey2 || !generatedAt) return null;
  const usage = row.usage;
  return {
    weekKey: weekKey2,
    generatedAt,
    fromDate: date(row.fromDate) ?? "",
    toDate: date(row.toDate) ?? "",
    headline: str(row.headline) ?? "",
    deferred: strings(row.deferred),
    model: str(row.model) ?? "",
    usage: {
      inputTokens: num(usage?.inputTokens) ?? 0,
      outputTokens: num(usage?.outputTokens) ?? 0,
      costUsd: num(usage?.costUsd) ?? 0
    },
    updatedAt: str(row.updatedAt) ?? generatedAt,
    deletedAt: str(row.deletedAt) ?? null
  };
}
function optional(key, value) {
  return value === null || value === void 0 ? {} : { [key]: value };
}
function str(value) {
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}
function num(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}
function bool(value) {
  return value === true;
}
function array(value) {
  return Array.isArray(value) ? value : [];
}
function strings(value) {
  return array(value).filter((item) => typeof item === "string");
}
function date(value) {
  const text = str(value);
  if (!text) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}
function iso(value) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? (/* @__PURE__ */ new Date()).toISOString() : new Date(parsed).toISOString();
}
const STATUSES = ["idle", "in_progress", "blocked", "waiting", "done", "dormant"];
function threadStatus(value) {
  return STATUSES.includes(value ?? "") ? value : "in_progress";
}
const OUTCOMES = ["completed", "ended_early", "switched", "abandoned", "recovered"];
function outcome(value) {
  return OUTCOMES.includes(value ?? "") ? value : "ended_early";
}
function insightIn(raw) {
  const row = raw;
  const periodKey = str(row.periodKey);
  const generatedAt = str(row.generatedAt);
  const updatedAt = str(row.updatedAt);
  if (!periodKey || !generatedAt || !updatedAt) return null;
  const usage = row.usage;
  return {
    periodKey,
    generatedAt,
    headline: str(row.headline) ?? "",
    body: str(row.body) ?? "",
    suggestion: str(row.suggestion) ?? "",
    model: str(row.model) ?? "",
    usage: {
      inputTokens: num(usage?.inputTokens) ?? 0,
      outputTokens: num(usage?.outputTokens) ?? 0,
      costUsd: num(usage?.costUsd) ?? 0
    },
    updatedAt,
    deletedAt: str(row.deletedAt) ?? null
  };
}
function dayRunIn(raw) {
  const row = raw;
  const localDate2 = date(row.localDate);
  const startedAt = str(row.startedAt);
  const updatedAt = str(row.updatedAt);
  if (!localDate2 || !startedAt || !updatedAt) return null;
  const shiftFrom = str(row.shiftFrom);
  return {
    localDate: localDate2,
    startedAt,
    endedAt: str(row.endedAt) ?? null,
    shiftMs: num(row.shiftMs) ?? 0,
    // Defensive: a malformed anchor is worse than none — it would slide the wrong half of
    // the day on every read.
    ...shiftFrom && /^([01]\d|2[0-3]):[0-5]\d$/.test(shiftFrom) ? { shiftFrom } : {},
    skippedBlockIds: strings(row.skippedBlockIds),
    updatedAt,
    deletedAt: str(row.deletedAt) ?? null
  };
}
function plannerSettingsOut(settings) {
  return {
    wakeTime: settings.wakeTime,
    dayStartTime: settings.dayStartTime,
    dayEndTime: settings.dayEndTime,
    plannerContext: settings.plannerContext,
    plannerModel: settings.plannerModel,
    plannerEffort: settings.plannerEffort
  };
}
function plannerSettingsIn(raw) {
  if (typeof raw !== "object" || raw === null) return {};
  const settings = raw.settings;
  if (typeof settings !== "object" || settings === null) return {};
  const blob = settings;
  const patch = {};
  const clock = (value) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : void 0;
  const wakeTime = clock(blob.wakeTime);
  if (wakeTime) patch.wakeTime = wakeTime;
  const dayStartTime = clock(blob.dayStartTime);
  if (dayStartTime) patch.dayStartTime = dayStartTime;
  const dayEndTime = clock(blob.dayEndTime);
  if (dayEndTime) patch.dayEndTime = dayEndTime;
  if (typeof blob.plannerContext === "string") patch.plannerContext = blob.plannerContext;
  if (typeof blob.plannerModel === "string" && PLANNER_MODELS.some((model) => model.id === blob.plannerModel)) {
    patch.plannerModel = blob.plannerModel;
  }
  if (blob.plannerEffort === "low" || blob.plannerEffort === "medium" || blob.plannerEffort === "high") {
    patch.plannerEffort = blob.plannerEffort;
  }
  return patch;
}
const MAX_THREADS = 2e3;
const MAX_DAYS = 2e3;
const MAX_SESSIONS = 5e3;
class SyncEngine {
  constructor(db, auth, state, onChanged, onSettingsAdopted) {
    this.db = db;
    this.auth = auth;
    this.state = state;
    this.onChanged = onChanged;
    this.onSettingsAdopted = onSettingsAdopted;
  }
  phase = "idle";
  message = null;
  inFlight = null;
  debounce = null;
  timer = null;
  pushSuspended = false;
  closed = false;
  status() {
    const snapshot = this.state.snapshot();
    return {
      phase: this.phase,
      lastSyncedAt: snapshot.lastSyncedAt,
      pending: snapshot.pending,
      cursor: snapshot.cursor,
      message: this.message
    };
  }
  /**
   * A focus session ticks every second, and pushing each tick would hammer the API and the
   * battery for nothing — the session is pushed once, when it ends. Pulling stays allowed.
   */
  suspendPush(suspended) {
    this.pushSuspended = suspended;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.sync().catch(() => {
    }), 5 * 6e4);
    this.timer.unref?.();
  }
  stop() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
    this.timer = null;
    this.debounce = null;
  }
  /** A local write happened. Coalesced, because a burst of typing is one sync, not thirty. */
  schedule(delayMs = 5e3) {
    if (this.closed || this.debounce) return;
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.sync().catch(() => {
      });
    }, delayMs);
    this.debounce.unref?.();
  }
  /**
   * One full round trip. Concurrent calls collapse into the one already running rather than
   * queueing behind it — three triggers firing at once is normal, three syncs is not.
   */
  async sync() {
    if (this.inFlight) return this.inFlight;
    const token = this.auth.currentToken();
    if (!token) return null;
    this.inFlight = this.run(token).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }
  async run(token) {
    this.setPhase("syncing", null);
    try {
      const pulled = await this.pullAndMerge(token);
      await this.backfillOnce();
      const { pushed, conflicts } = this.pushSuspended ? { pushed: 0, conflicts: 0 } : await this.pushDirty(token);
      this.state.markSynced((/* @__PURE__ */ new Date()).toISOString());
      await this.state.flush();
      this.setPhase("idle", null);
      return { pulled, pushed, conflicts };
    } catch (error) {
      if (error instanceof NetworkError) {
        this.setPhase("offline", error.message);
        return null;
      }
      if (error instanceof ApiError && error.isUnauthorized) {
        await this.auth.handleUnauthorized();
        this.setPhase("error", "Signed out — sign in again to keep syncing.");
        return null;
      }
      this.setPhase("error", error instanceof Error ? error.message : "Sync failed.");
      return null;
    }
  }
  // ----------------------------------------------------------------- pull
  async pullAndMerge(token) {
    const response = await this.auth.api.pull(token, this.state.since);
    let merged = 0;
    merged += await this.mergeInto(
      this.remote(COLLECTION.threads),
      response.threads,
      threadIn,
      (record) => record.id,
      (record) => record.updatedAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.days),
      response.days,
      dayIn,
      (record) => record.localDate,
      (record) => record.updatedAt ?? record.createdAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.sessions),
      response.sessions,
      sessionIn,
      (record) => record.id,
      (record) => record.updatedAt ?? record.startedAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.mindful),
      response.mindfulSessions,
      mindfulIn,
      (record) => record.id,
      (record) => record.updatedAt ?? record.startedAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.goals),
      response.goals,
      goalIn,
      (record) => record.id,
      (record) => record.updatedAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.plans),
      response.plans,
      planIn,
      (record) => record.localDate,
      (record) => record.updatedAt ?? record.generatedAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.weekPlans),
      response.weekPlans,
      weekPlanIn,
      (record) => record.weekKey,
      (record) => record.updatedAt ?? record.generatedAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.dayRuns),
      response.dayRuns,
      dayRunIn,
      (record) => record.localDate,
      (record) => record.updatedAt
    );
    merged += await this.mergeInto(
      this.remote(COLLECTION.insights),
      response.insights,
      insightIn,
      (record) => record.periodKey,
      (record) => record.updatedAt ?? record.generatedAt
    );
    merged += await this.adoptProfileSettings(response.profile);
    if (typeof response.seq === "number") this.state.advanceCursor(response.seq);
    return merged;
  }
  /**
   * Planner settings edited on another device land here. Skipped entirely while this machine
   * has its own profile edit queued — the pending push is newer intent, and adopting over it
   * would erase what was just typed before it ever left the building.
   */
  async adoptProfileSettings(raw) {
    if (!raw || this.state.isProfileDirty) return 0;
    const patch = plannerSettingsIn(raw);
    const current = this.db.settings.get();
    const changed = Object.keys(patch).some(
      (key) => patch[key] !== current[key]
    );
    if (!changed) return 0;
    const settings = await this.db.settings.update(patch);
    this.onSettingsAdopted?.(settings);
    return 1;
  }
  /**
   * Last-write-wins on `updatedAt`, never on arrival order. The case that matters is not two
   * people editing at once — it is this laptop waking after a weekend and meeting edits the
   * phone made on Saturday.
   *
   * Tombstones are written like any other record. Dropping them instead is how a thread
   * deleted on the phone quietly comes back on the next sync.
   */
  async mergeInto(collection, rows, decode, keyOf, stampOf) {
    if (!rows?.length) return 0;
    let merged = 0;
    for (const raw of rows) {
      const incoming = decode(raw);
      if (!incoming) continue;
      const key = keyOf(incoming);
      const existing = await collection.get(key);
      if (existing && !isNewer(stampOf(incoming), stampOf(existing))) continue;
      await collection.put(incoming);
      this.state.clear([key]);
      merged += 1;
    }
    return merged;
  }
  // ----------------------------------------------------------------- push
  async pushDirty(token) {
    const threads = await this.dirtyRecords(COLLECTION.threads);
    const days = await this.dirtyRecords(COLLECTION.days);
    const sessions = await this.dirtyRecords(COLLECTION.sessions);
    const sits = await this.dirtyRecords(COLLECTION.mindful);
    const goals = await this.dirtyRecords(COLLECTION.goals);
    const plans = await this.dirtyRecords(COLLECTION.plans);
    const weekPlans = await this.dirtyRecords(COLLECTION.weekPlans);
    const dayRuns = await this.dirtyRecords(COLLECTION.dayRuns);
    const profileDirty = this.state.isProfileDirty;
    if (!threads.length && !days.length && !sessions.length && !sits.length && !goals.length && !plans.length && !weekPlans.length && !dayRuns.length && !profileDirty) {
      return { pushed: 0, conflicts: 0 };
    }
    let pushed = 0;
    let conflicts = 0;
    const batches = chunk(threads, days, sessions, sits, goals, plans, weekPlans);
    for (const [index, batch] of batches.entries()) {
      const body = {
        threads: batch.threads.map(threadOut),
        days: batch.days.map(dayOut),
        sessions: batch.sessions.map(sessionOut),
        mindfulSessions: batch.sits.map(mindfulOut),
        goals: batch.goals.map(goalOut),
        plans: batch.plans.map(planOut),
        weekPlans: batch.weekPlans.map(weekPlanOut),
        // A handful per week at most; they ride the first batch like the goals do.
        ...index === 0 && dayRuns.length ? { dayRuns: dayRuns.map(dayRunOut) } : {}
      };
      if (index === 0 && profileDirty) {
        const displayName = this.auth.state().account?.displayName ?? null;
        const settings = this.db.settings.get();
        body.profile = {
          timezone: settings.timezone,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          ...displayName ? { displayName } : {},
          // The planner slice rides along so the server — which builds every plan from
          // the profile it holds — actually knows the standing context and day shape
          // typed into this app. The server merges these keys rather than replacing
          // the blob, so keys another device owns survive this push.
          settings: plannerSettingsOut(settings)
        };
      }
      const result = await this.auth.api.push(token, body);
      const applied = result.applied ?? [];
      pushed += applied.length;
      this.state.clear(applied);
      for (const conflict of result.conflicts ?? []) {
        conflicts += 1;
        await this.applyConflict(conflict);
        this.state.clear([conflict.id]);
      }
      if (index === 0 && profileDirty) this.state.clearProfile();
      if (typeof result.seq === "number") this.state.advanceCursor(result.seq);
    }
    return { pushed, conflicts };
  }
  async applyConflict(conflict) {
    if (!conflict.server) return;
    switch (conflict.kind) {
      case "thread": {
        const winner = threadIn(conflict.server);
        if (winner) await this.remote(COLLECTION.threads).put(winner);
        return;
      }
      case "day": {
        const winner = dayIn(conflict.server);
        if (winner) await this.remote(COLLECTION.days).put(winner);
        return;
      }
      case "session": {
        const winner = sessionIn(conflict.server);
        if (winner) await this.remote(COLLECTION.sessions).put(winner);
        return;
      }
      case "mindfulSession": {
        const winner = mindfulIn(conflict.server);
        if (winner) await this.remote(COLLECTION.mindful).put(winner);
        return;
      }
      case "goal": {
        const winner = goalIn(conflict.server);
        if (winner) await this.remote(COLLECTION.goals).put(winner);
        return;
      }
      case "plan": {
        const winner = planIn(conflict.server);
        if (winner) await this.remote(COLLECTION.plans).put(winner);
        return;
      }
      case "weekPlan": {
        const winner = weekPlanIn(conflict.server);
        if (winner) await this.remote(COLLECTION.weekPlans).put(winner);
        return;
      }
      case "dayRun": {
        const winner = dayRunIn(conflict.server);
        if (winner) await this.remote(COLLECTION.dayRuns).put(winner);
        return;
      }
      default:
        return;
    }
  }
  /**
   * Offers every local record to the server once.
   *
   * The dirty queue is only ever filled by local writes, so records that existed *before* this
   * device signed in were never queued — nothing had written them since sync existed. The
   * engine then correctly reported nothing pending while the account stayed empty, which looks
   * from the outside exactly like sync being broken.
   *
   * Marking rather than pushing directly means the normal path still applies: chunking,
   * last-write-wins, and conflicts resolving in the server's favour. A record the server
   * already has newer comes straight back as a conflict and is dropped from the queue.
   */
  async backfillOnce() {
    if (this.state.hasBackfilled) return;
    for (const name of [
      COLLECTION.threads,
      COLLECTION.days,
      COLLECTION.sessions,
      COLLECTION.mindful,
      // Goals only. Plans are the server's to write, so offering the local ones would push
      // a plan this device generated back when it held the key — and the server would then
      // hand that stale week to the phone as if it had just made it.
      COLLECTION.goals
    ]) {
      const records = await this.remote(name).all();
      const keys = records.map((record) => record.id ?? record.localDate).filter((key) => typeof key === "string" && key.length > 0);
      if (keys.length) this.state.markMany(name, keys);
    }
    this.state.markBackfilled();
    await this.state.flush();
  }
  // -------------------------------------------------------------- internals
  /** Writes that must not be marked dirty: they came from the server. */
  remote(name) {
    return this.db.store.collection(name, { track: false });
  }
  async dirtyRecords(name) {
    const keys = this.state.keys(name);
    if (!keys.length) return [];
    const collection = this.db.store.collection(name, { track: false });
    const out = [];
    for (const key of keys) {
      const record = await collection.get(key);
      if (record) out.push(record);
      else this.state.clear([key]);
    }
    return out;
  }
  setPhase(phase, message) {
    this.phase = phase;
    this.message = message;
    this.onChanged(this.status());
  }
}
function isNewer(incoming, local) {
  if (!incoming) return false;
  if (!local) return true;
  const a = Date.parse(incoming);
  const b = Date.parse(local);
  if (Number.isNaN(a)) return false;
  if (Number.isNaN(b)) return true;
  return a > b;
}
function chunk(threads, days, sessions, sits, goals = [], plans = [], weekPlans = []) {
  const threadPages = pages(threads, MAX_THREADS);
  const dayPages = pages(days, MAX_DAYS);
  const sessionPages = pages(sessions, MAX_SESSIONS);
  const goalPages = pages(goals, MAX_THREADS);
  const count = Math.max(
    1,
    threadPages.length,
    dayPages.length,
    sessionPages.length,
    goalPages.length
  );
  return Array.from({ length: count }, (_unused, index) => ({
    threads: threadPages[index] ?? [],
    days: dayPages[index] ?? [],
    sessions: sessionPages[index] ?? [],
    sits: index === 0 ? sits.slice(0, MAX_SESSIONS) : [],
    goals: goalPages[index] ?? [],
    // Plans are only ever tombstones and there are at most a handful, so they all ride the
    // first batch rather than earning a page count of their own.
    plans: index === 0 ? plans.slice(0, MAX_DAYS) : [],
    weekPlans: index === 0 ? weekPlans.slice(0, MAX_DAYS) : []
  }));
}
function pages(items, size) {
  if (!items.length) return [];
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}
const TRACKED = [
  COLLECTION.threads,
  COLLECTION.days,
  COLLECTION.sessions,
  COLLECTION.mindful,
  COLLECTION.goals,
  // Plans are written by the server, so the only local write that ever queues one is a
  // tombstone. They are tracked anyway: "I threw this week's plan away" has to reach the
  // other device, and a delete that stays local is a plan that reappears on the next pull.
  COLLECTION.plans,
  COLLECTION.weekPlans,
  COLLECTION.dayRuns
];
class SyncState {
  constructor(root) {
    this.root = root;
  }
  cursor = 0;
  lastSyncedAt = null;
  profileDirty = false;
  backfilled = false;
  dirty = new Map(
    TRACKED.map((name) => [name, /* @__PURE__ */ new Set()])
  );
  writing = null;
  again = false;
  get file() {
    return path.join(this.root, "sync.json");
  }
  async load() {
    const raw = await readFileIfExists(this.file);
    if (raw === null) return;
    try {
      const parsed = JSON.parse(raw);
      this.cursor = Number.isFinite(parsed.cursor) ? parsed.cursor : 0;
      this.lastSyncedAt = parsed.lastSyncedAt ?? null;
      this.profileDirty = parsed.profileDirty ?? false;
      this.backfilled = parsed.backfilled ?? false;
      for (const name of TRACKED) {
        this.dirty.set(name, new Set(parsed.dirty?.[name] ?? []));
      }
    } catch {
      console.warn("[sync] sync.json unreadable — starting from a full pull");
      this.reset();
    }
  }
  snapshot() {
    return {
      cursor: this.cursor,
      lastSyncedAt: this.lastSyncedAt,
      pending: this.pendingCount()
    };
  }
  pendingCount() {
    let total = 0;
    for (const set of this.dirty.values()) total += set.size;
    return total;
  }
  keys(name) {
    return [...this.dirty.get(name) ?? []];
  }
  get since() {
    return this.cursor;
  }
  get isProfileDirty() {
    return this.profileDirty;
  }
  get hasBackfilled() {
    return this.backfilled;
  }
  /** Queues many keys at once. Used by the one-time backfill. */
  markMany(name, keys) {
    const set = this.dirty.get(name);
    if (!set) return;
    let changed = false;
    for (const key of keys) {
      if (!set.has(key)) {
        set.add(key);
        changed = true;
      }
    }
    if (changed) this.schedulePersist();
  }
  markBackfilled() {
    if (this.backfilled) return;
    this.backfilled = true;
    this.schedulePersist();
  }
  /** Called for every local write, from the store's own write path. */
  mark(name, key) {
    const set = this.dirty.get(name);
    if (!set || set.has(key)) return;
    set.add(key);
    this.schedulePersist();
  }
  markProfile() {
    if (this.profileDirty) return;
    this.profileDirty = true;
    this.schedulePersist();
  }
  /**
   * Drops keys the server has accepted — and keys it rejected as conflicts, which is the same
   * thing for queueing purposes. A conflict means our version lost; keeping it dirty would
   * push the same stale record forever.
   *
   * `applied` from the server is a flat list of ids across every kind, so it is matched
   * against all of them. Ids are ULIDs and day keys are dates, so they cannot collide.
   */
  clear(keys) {
    let changed = false;
    for (const key of keys) {
      for (const set of this.dirty.values()) {
        if (set.delete(key)) changed = true;
      }
    }
    if (changed) this.schedulePersist();
  }
  clearProfile() {
    if (!this.profileDirty) return;
    this.profileDirty = false;
    this.schedulePersist();
  }
  advanceCursor(seq) {
    if (seq <= this.cursor) return;
    this.cursor = seq;
    this.schedulePersist();
  }
  markSynced(at) {
    this.lastSyncedAt = at;
    this.schedulePersist();
  }
  /** Signing out. The next account starts from nothing, not from this one's queue. */
  reset() {
    this.cursor = 0;
    this.lastSyncedAt = null;
    this.profileDirty = false;
    this.backfilled = false;
    for (const set of this.dirty.values()) set.clear();
    this.schedulePersist();
  }
  /**
   * Waits for the queue file to be on disk. It joins the serialised chain rather than writing
   * alongside it — two concurrent writers of the same file is how the last one wins by luck.
   */
  async flush() {
    while (this.writing) {
      const current = this.writing;
      await current;
      if (this.writing === current) break;
    }
    await this.persist();
  }
  // ---------------------------------------------------------------- private
  /**
   * Serialised rather than debounced: this file must never lag behind a crash by more than the
   * write in flight, because a lost dirty key is a record that silently never syncs. Writes
   * that arrive during one are coalesced into a single follow-up.
   */
  schedulePersist() {
    if (this.writing) {
      this.again = true;
      return;
    }
    this.writing = this.persist().catch((error) => console.error("[sync] could not save the queue", error)).finally(() => {
      this.writing = null;
      if (this.again) {
        this.again = false;
        this.schedulePersist();
      }
    });
  }
  async persist() {
    const out = {
      version: 1,
      cursor: this.cursor,
      lastSyncedAt: this.lastSyncedAt,
      profileDirty: this.profileDirty,
      backfilled: this.backfilled,
      dirty: Object.fromEntries(TRACKED.map((name) => [name, this.keys(name)]))
    };
    await atomicWriteFile(this.file, `${JSON.stringify(out, null, 2)}
`);
  }
}
class SessionService {
  constructor(db, events) {
    this.db = db;
    this.events = events;
  }
  running = null;
  ticker = null;
  sinceCheckpoint = 0;
  isRunning() {
    return this.running !== null;
  }
  currentThreadId() {
    return this.running?.session.threadId ?? null;
  }
  async state() {
    if (!this.running) return null;
    return this.describe(this.running);
  }
  async start(threadId, plannedMs) {
    if (this.running) await this.end("switched");
    const thread = await this.db.threads.get(threadId);
    if (!thread) throw new Error(`thread not found: ${threadId}`);
    const session = {
      id: ulid(),
      threadId,
      startedAt: this.db.clock.now(),
      localDate: this.db.clock.today(),
      plannedMs: plannedMs ?? this.db.settings.get().defaultSessionMs,
      activeMs: 0,
      grantedMs: 0,
      outcome: "ended_early",
      distractions: [],
      pauses: []
    };
    this.running = { session, markedAt: performance.now(), paused: false };
    await this.db.sessions.save(session);
    if (thread.status !== "in_progress") {
      await this.db.threads.setStatus(threadId, "in_progress");
    }
    await this.db.settings.update({ lastOpenSessionId: session.id });
    this.startTicker();
    const state = await this.describe(this.running);
    this.events.onStarted(session);
    this.events.onChanged(state);
    this.events.onDaysTouched([session.localDate]);
    return state;
  }
  async pause() {
    const running = this.running;
    if (!running || running.paused) return this.state();
    this.accumulate(running);
    running.paused = true;
    running.session.pauses.push({ at: this.db.clock.now() });
    await this.persist();
    const state = await this.describe(running);
    this.events.onChanged(state);
    return state;
  }
  async resume() {
    const running = this.running;
    if (!running || !running.paused) return this.state();
    const open = running.session.pauses[running.session.pauses.length - 1];
    if (open && !open.resumedAt) open.resumedAt = this.db.clock.now();
    running.paused = false;
    running.markedAt = performance.now();
    await this.persist();
    const state = await this.describe(running);
    this.events.onChanged(state);
    return state;
  }
  /**
   * One tap, no dialog. Adds grace time to the clock and costs exactly nothing — logging a
   * distraction must never lower a number the user can see.
   */
  async logDistraction(kind = "unspecified", note) {
    const running = this.running;
    if (!running) throw new Error("no session running");
    const grantedMs = this.db.settings.get().distractionGraceMs;
    const distraction = {
      id: ulid(),
      at: this.db.clock.now(),
      kind,
      grantedMs,
      ...note ? { note } : {}
    };
    running.session.distractions.push(distraction);
    running.session.grantedMs += grantedMs;
    const thread = await this.db.threads.get(running.session.threadId);
    if (thread) await this.db.threads.save({ ...thread, distractionCount: thread.distractionCount + 1 });
    await this.persist();
    const minutes = Math.round(grantedMs / 6e4);
    this.events.onToast(
      minutes > 0 ? `Parked. ${minutes === 1 ? "A minute" : `${minutes} minutes`} back.` : "Parked."
    );
    this.events.onChanged(await this.describe(running));
    this.events.onDaysTouched([running.session.localDate]);
    return distraction;
  }
  /** Replaces "skip": ends the current session and starts the next one. No friction, no warning. */
  async switchTo(threadId) {
    const previous = this.running;
    if (previous) previous.session.switchedToThreadId = threadId;
    await this.end("switched");
    return this.start(threadId);
  }
  async end(outcome2) {
    const running = this.running;
    if (!running) return;
    this.stopTicker();
    if (!running.paused) this.accumulate(running);
    this.running = null;
    const { session } = running;
    session.endedAt = this.db.clock.now();
    session.outcome = outcome2 ?? (this.remaining(session) <= 0 ? "completed" : "ended_early");
    await this.db.sessions.save(session);
    const thread = await this.db.threads.get(session.threadId);
    if (thread) {
      await this.db.threads.save({
        ...thread,
        totalFocusMs: thread.totalFocusMs + session.activeMs,
        sessionCount: thread.sessionCount + 1
      });
    }
    await this.db.settings.update({ lastOpenSessionId: void 0 });
    await this.db.store.flush();
    this.events.onChanged(null);
    this.events.onDaysTouched([session.localDate]);
    if (session.outcome === "completed") {
      this.events.onCompleted(session, thread?.title ?? "Untitled");
    }
  }
  /**
   * Crash recovery. Time that was actually spent is never silently discarded — the user is
   * asked, and the default framing is "count it".
   */
  async findRecoverable() {
    const open = await this.db.sessions.findOpen();
    if (!open) return null;
    return open;
  }
  async resolveRecovery(sessionId, keep) {
    const session = await this.db.sessions.get(sessionId);
    if (!session || session.endedAt) return;
    session.endedAt = this.db.clock.now();
    if (keep) {
      session.outcome = "recovered";
      await this.db.sessions.save(session);
      const thread = await this.db.threads.get(session.threadId);
      if (thread) {
        await this.db.threads.save({
          ...thread,
          totalFocusMs: thread.totalFocusMs + session.activeMs,
          sessionCount: thread.sessionCount + 1
        });
      }
      this.events.onDaysTouched([session.localDate]);
    } else {
      session.outcome = "abandoned";
      session.activeMs = 0;
      await this.db.sessions.save(session);
    }
    await this.db.settings.update({ lastOpenSessionId: void 0 });
    await this.db.store.flush();
  }
  // ---------------------------------------------------------------- internals
  accumulate(running) {
    const now = performance.now();
    running.session.activeMs += Math.max(0, now - running.markedAt);
    running.markedAt = now;
  }
  remaining(session) {
    return session.plannedMs + session.grantedMs - session.activeMs;
  }
  async describe(running) {
    const thread = await this.db.threads.get(running.session.threadId);
    const next = thread ? nextAction(thread.steps) : null;
    return {
      session: { ...running.session },
      threadTitle: thread?.title ?? "Untitled",
      nextAction: next?.text ?? null,
      remainingMs: Math.max(0, this.remaining(running.session)),
      paused: running.paused
    };
  }
  startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => void this.tick(), HUD_TICK_MS);
  }
  stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
    this.sinceCheckpoint = 0;
  }
  async tick() {
    const running = this.running;
    if (!running) return;
    if (!running.paused) this.accumulate(running);
    const { session } = running;
    const remainingMs = Math.max(0, this.remaining(session));
    const total = session.plannedMs + session.grantedMs;
    this.events.onTick({
      sessionId: session.id,
      remainingMs,
      activeMs: session.activeMs,
      paused: running.paused,
      progress: total > 0 ? Math.min(1, session.activeMs / total) : 0
    });
    this.sinceCheckpoint += HUD_TICK_MS;
    if (this.sinceCheckpoint >= SESSION_CHECKPOINT_MS) {
      this.sinceCheckpoint = 0;
      await this.persist();
    }
    if (remainingMs <= 0) await this.end("completed");
  }
  async persist() {
    if (!this.running) return;
    await this.db.sessions.save({ ...this.running.session });
  }
}
class StageController {
  constructor(events, focusMs) {
    this.events = events;
    this.focusMs = focusMs;
  }
  state = null;
  ticker = null;
  current() {
    return this.state ? { ...this.state } : null;
  }
  /** Called when a focus block completes: park on the break, paused, waiting for Resume. */
  awaitBreak(threadId, threadTitle) {
    this.park({ kind: "break", threadId, threadTitle, plannedMs: BREAK_MS });
    this.events.onStageEnded("focus", "break");
  }
  /** Any new session starting supersedes whatever the cycle was waiting on. */
  clear() {
    this.stopTicker();
    if (!this.state) return;
    this.state = null;
    this.events.onChanged(null);
  }
  async resume() {
    const state = this.state;
    if (!state) return null;
    if (state.kind === "focus") {
      const { threadId } = state;
      this.clear();
      await this.events.onStartFocus(threadId);
      return null;
    }
    this.state = { ...state, running: true };
    this.startTicker();
    this.events.onChanged(this.current());
    return this.current();
  }
  /** Skip the break and go straight to the next focus block, still waiting for Resume. */
  async skip() {
    const state = this.state;
    if (!state) return null;
    if (state.kind === "focus") return this.resume();
    this.finishBreak();
    return this.current();
  }
  stop() {
    this.clear();
  }
  /** Park during a break: the same two minutes back, applied to the break's clock. */
  grant(ms) {
    const state = this.state;
    if (!state || state.kind !== "break") return false;
    this.state = {
      ...state,
      plannedMs: state.plannedMs + ms,
      remainingMs: state.remainingMs + ms
    };
    this.events.onChanged(this.current());
    return true;
  }
  destroy() {
    this.stopTicker();
    this.state = null;
  }
  // ---------------------------------------------------------------- internals
  park(next) {
    this.stopTicker();
    this.state = { ...next, remainingMs: next.plannedMs, running: false };
    this.events.onChanged(this.current());
  }
  finishBreak() {
    const state = this.state;
    if (!state) return;
    this.park({
      kind: "focus",
      threadId: state.threadId,
      threadTitle: state.threadTitle,
      plannedMs: this.focusMs()
    });
    this.events.onStageEnded("break", "focus");
  }
  startTicker() {
    this.stopTicker();
    this.ticker = setInterval(() => this.tick(), HUD_TICK_MS);
  }
  stopTicker() {
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = null;
  }
  tick() {
    const state = this.state;
    if (!state || !state.running) return;
    const remainingMs = Math.max(0, state.remainingMs - HUD_TICK_MS);
    this.state = { ...state, remainingMs };
    this.events.onTick({
      remainingMs,
      progress: state.plannedMs > 0 ? 1 - remainingMs / state.plannedMs : 1
    });
    if (remainingMs <= 0) this.finishBreak();
  }
}
function isMilestone(steps, personalBest2) {
  return personalBest2 || steps >= MILESTONE_STEP_COUNT;
}
function weightedPick(packs, random) {
  const total = packs.reduce((sum, pack) => sum + pack.weight, 0);
  if (total <= 0) return packs[0] ?? null;
  let roll = random() * total;
  for (const pack of packs) {
    roll -= pack.weight;
    if (roll <= 0) return pack;
  }
  return packs[packs.length - 1] ?? null;
}
function selectPack(registry, context) {
  const random = context.random ?? Math.random;
  const eligible = context.reducedMotion ? registry.filter((pack) => pack.reducedMotionSafe) : registry;
  if (eligible.length === 0) return null;
  const rare = eligible.filter((pack) => pack.tier === "rare");
  if ((context.milestone || random() < RARE_ROLL_CHANCE) && rare.length > 0) {
    return weightedPick(rare, random);
  }
  const common = eligible.filter((pack) => pack.tier === "common");
  const pool = common.filter((pack) => !context.recentIds.includes(pack.id));
  return weightedPick(pool.length > 0 ? pool : common, random);
}
function rememberPack(recentIds, packId) {
  return [packId, ...recentIds.filter((id) => id !== packId)].slice(0, CELEBRATION_ANTI_REPEAT);
}
const DEFAULT_PACK_ID = "confetti-burst";
const PACK_REGISTRY = [
  { id: "confetti-burst", weight: 4, tier: "common", reducedMotionSafe: false },
  { id: "ink-bloom", weight: 3, tier: "common", reducedMotionSafe: true },
  { id: "constellation", weight: 3, tier: "common", reducedMotionSafe: true },
  { id: "rise", weight: 2, tier: "common", reducedMotionSafe: true },
  { id: "boss-defeated", weight: 2, tier: "rare", reducedMotionSafe: false },
  { id: "ticker-tape", weight: 1, tier: "rare", reducedMotionSafe: true }
];
class CelebrationOrchestrator {
  constructor(db, overlay, getMomentum, getReducedMotion) {
    this.db = db;
    this.overlay = overlay;
    this.getMomentum = getMomentum;
    this.getReducedMotion = getReducedMotion;
  }
  async celebrate(thread) {
    if (!this.db.settings.get().celebrationsEnabled) return;
    const scope = await this.getMomentum();
    const personalBest2 = scope.insight.kind === "personal_best";
    const settings = this.db.settings.get();
    const pack = selectPack(PACK_REGISTRY, {
      recentIds: settings.recentCelebrationIds,
      reducedMotion: this.getReducedMotion(),
      milestone: isMilestone(thread.steps.length, personalBest2)
    });
    if (!pack) return;
    await this.db.settings.update({
      recentCelebrationIds: rememberPack(settings.recentCelebrationIds, pack.id)
    });
    const payload = {
      threadTitle: thread.title,
      steps: thread.steps.filter((step) => step.done).length,
      focusMs: thread.totalFocusMs,
      sessionCount: thread.sessionCount,
      momentum: scope.momentum,
      band: scope.band.label
    };
    const cue = {
      packId: pack.id,
      payload,
      reducedMotion: this.getReducedMotion(),
      soundEnabled: settings.soundEnabled
    };
    this.overlay.play(cue);
  }
  /**
   * The short one (§7). A finished focus block is worth marking, but not with the full pack
   * roulette — it always uses the default confetti so a completed 25 minutes feels the same
   * every time, and so it never eats the anti-repeat memory the thread celebration depends on.
   */
  async celebrateSession(threadTitle, focusMs) {
    const settings = this.db.settings.get();
    if (!settings.celebrationsEnabled) return;
    const scope = await this.getMomentum();
    this.overlay.play({
      packId: DEFAULT_PACK_ID,
      payload: {
        threadTitle,
        steps: 0,
        focusMs,
        sessionCount: 1,
        momentum: scope.momentum,
        band: scope.band.label
      },
      reducedMotion: this.getReducedMotion(),
      soundEnabled: settings.soundEnabled
    });
  }
  stop() {
    this.overlay.stop();
  }
}
const here$2 = path.dirname(fileURLToPath(import.meta.url));
const preloadPath = path.join(here$2, "../preload/index.mjs");
function loadRenderer(window, page, search) {
  const query = search ? `?${search}` : "";
  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (devServer) {
    void window.loadURL(`${devServer}/${page === "index" ? "" : `${page}.html`}${query}`);
  } else {
    void window.loadFile(path.join(here$2, `../renderer/${page}.html`), {
      ...search ? { search } : {}
    });
  }
}
class CelebrationOverlay {
  windows = /* @__PURE__ */ new Map();
  timeout = null;
  /** Dedupe guard: overlapping triggers must not stack overlays (§7). */
  playing = false;
  ensure(display) {
    const existing = this.windows.get(display.id);
    if (existing && !existing.isDestroyed()) return existing;
    const window = new BrowserWindow({
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      focusable: false,
      fullscreenable: false,
      show: false,
      webPreferences: {
        preload: preloadPath,
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    window.setIgnoreMouseEvents(true);
    window.setAlwaysOnTop(true, "screen-saver");
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    loadRenderer(window, "celebration");
    this.windows.set(display.id, window);
    return window;
  }
  play(cue) {
    if (this.playing) return;
    this.playing = true;
    for (const display of screen.getAllDisplays()) {
      const window = this.ensure(display);
      window.setBounds(display.bounds);
      window.setIgnoreMouseEvents(true);
      window.showInactive();
      window.webContents.send("celebration:play", cue);
    }
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.stop(), CELEBRATION_HARD_TIMEOUT_MS);
  }
  stop() {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    this.playing = false;
    for (const window of this.windows.values()) {
      if (window.isDestroyed()) continue;
      window.webContents.send("celebration:stop");
      window.hide();
    }
  }
  destroy() {
    this.stop();
    for (const window of this.windows.values()) {
      if (!window.isDestroyed()) window.destroy();
    }
    this.windows.clear();
  }
}
const CALENDAR_WIDTH = 560;
const CALENDAR_HEIGHT = 420;
const MIN_WIDTH = 380;
const MIN_HEIGHT = 260;
function defaultCalendarBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - CALENDAR_WIDTH - 24),
    y: Math.round(workArea.y + 24),
    width: CALENDAR_WIDTH,
    height: CALENDAR_HEIGHT
  };
}
function createCalendarWindow(saved, onMoved) {
  const bounds = onScreen(saved) ?? defaultCalendarBounds();
  const window = new BrowserWindow({
    ...bounds,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.setAlwaysOnTop(true, "floating");
  window.once("ready-to-show", () => window.show());
  const remember = () => {
    if (window.isDestroyed()) return;
    const at = window.getBounds();
    onMoved({ x: at.x, y: at.y, width: at.width, height: at.height });
  };
  window.on("moved", remember);
  window.on("resized", remember);
  loadRenderer(window, "calendar");
  return window;
}
function onScreen(bounds) {
  if (!bounds) return void 0;
  const visible = screen.getAllDisplays().some(({ workArea }) => {
    const overlapX = bounds.x < workArea.x + workArea.width && bounds.x + bounds.width > workArea.x;
    const overlapY = bounds.y < workArea.y + workArea.height && bounds.y + 40 > workArea.y;
    return overlapX && overlapY;
  });
  return visible ? bounds : void 0;
}
const HUD_BASE_WIDTH = 470;
const HUD_BASE_HEIGHT = 106;
const REFERENCE_WIDTH = 1800;
const MIN_SCALE = 0.8;
const MARGIN = 24;
function hudScaleFor(display) {
  const fit = display.workArea.width / REFERENCE_WIDTH;
  return Math.round(Math.min(1, Math.max(MIN_SCALE, fit)) * 100) / 100;
}
function hudSizeFor(display) {
  const scale = hudScaleFor(display);
  return {
    scale,
    width: Math.round(HUD_BASE_WIDTH * scale),
    height: Math.round(HUD_BASE_HEIGHT * scale)
  };
}
function defaultHudPosition(display = screen.getPrimaryDisplay()) {
  const { workArea } = display;
  const { width, height } = hudSizeFor(display);
  return {
    x: Math.round(workArea.x + workArea.width - width - MARGIN),
    y: Math.round(workArea.y + workArea.height - height - MARGIN)
  };
}
function createHudWindow(saved, onMoved) {
  const display = saved ? screen.getDisplayNearestPoint(saved) : screen.getPrimaryDisplay();
  const { scale, width, height } = hudSizeFor(display);
  const position = clampToWorkArea(
    saved ?? defaultHudPosition(display),
    display,
    width,
    height
  );
  const window = new BrowserWindow({
    width,
    height,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.setAlwaysOnTop(true, "floating");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.once("ready-to-show", () => window.show());
  window.on("moved", () => {
    const [x, y] = window.getPosition();
    if (typeof x === "number" && typeof y === "number") onMoved({ x, y });
  });
  loadRenderer(window, "hud", `scale=${scale}`);
  return window;
}
function clampToWorkArea(at, display, width, height) {
  const { workArea } = display;
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;
  return {
    x: Math.round(Math.min(Math.max(at.x, workArea.x), Math.max(workArea.x, maxX))),
    y: Math.round(Math.min(Math.max(at.y, workArea.y), Math.max(workArea.y, maxY)))
  };
}
const here$1 = path.dirname(fileURLToPath(import.meta.url));
function appIconPath() {
  return path.join(here$1, "../../assets/icon.png");
}
function appIcon() {
  return nativeImage.createFromPath(appIconPath());
}
function applyDockIcon() {
  if (process.platform !== "darwin" || !app.dock) return;
  const image = appIcon();
  if (!image.isEmpty()) app.dock.setIcon(image);
}
function createMainWindow(hooks) {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#0F1115",
    icon: appIconPath(),
    title: "ADHD Superpower",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (!globalThis.__threadQuitting) {
      event.preventDefault();
      window.hide();
      hooks.onHide();
    }
  });
  window.on("blur", hooks.onBlur);
  window.on("focus", hooks.onFocus);
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  loadRenderer(window, "index");
  return window;
}
const here = path.dirname(fileURLToPath(import.meta.url));
function createTray(hooks) {
  const image = nativeImage.createFromPath(
    path.join(here, "../../assets/trayTemplate.png")
  );
  image.setTemplateImage(true);
  const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("ADHD Superpower");
  tray.on("click", hooks.onShow);
  return tray;
}
let lastTitle = null;
function titleFor(state) {
  if (!state.running) return "";
  return state.paused ? `❙❙ ${formatTrayCountdown(state.remainingMs)}` : formatTrayCountdown(state.remainingMs);
}
function updateTrayCountdown(tray, state) {
  if (process.platform !== "darwin") return;
  const title = titleFor(state);
  if (title === lastTitle) return;
  lastTitle = title;
  tray.setTitle(title);
}
function updateTray(tray, state, hooks) {
  updateTrayCountdown(tray, state);
  tray.setToolTip(
    [
      state.threadTitle ? `ADHD Superpower — ${state.threadTitle}` : "ADHD Superpower",
      state.running ? `${formatClock(state.remainingMs)} left` : null
    ].filter(Boolean).join("\n")
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: state.threadTitle ?? "Nothing running", enabled: false },
      { type: "separator" },
      { label: "Open ADHD Superpower", click: hooks.onShow },
      {
        label: state.paused ? "Resume" : "Pause",
        enabled: state.running,
        click: hooks.onPauseResume
      },
      { label: "End session", enabled: state.running, click: hooks.onEnd },
      { type: "separator" },
      { label: "Floating calendar", click: hooks.onToggleCalendar },
      { type: "separator" },
      { label: "Quit", accelerator: "Command+Q", click: hooks.onQuit }
    ])
  );
}
function markQuitting() {
  globalThis.__threadQuitting = true;
}
function appDataRoot() {
  return path.join(app.getPath("userData"), "data");
}
let microTickVariant = 0;
class AppContext {
  db;
  sessions;
  stages;
  analytics;
  celebrations;
  auth;
  planner;
  calendar;
  now;
  sync;
  syncState;
  main = null;
  hud = null;
  calendarWidget = null;
  overlay;
  tray = null;
  mainReady = false;
  pendingRecovery = null;
  static async create(root) {
    const ctx2 = new AppContext();
    ctx2.syncState = new SyncState(root);
    await ctx2.syncState.load();
    ctx2.db = await Database.open(root, {
      onUnreadable: (file, reason) => {
        console.warn("[storage]", file, reason);
        ctx2.broadcast("storage:banner", {
          message: `Part of a data file could not be read (${reason}). Everything else loaded normally.`,
          files: [file]
        });
      },
      onWrite: (collection, key) => {
        ctx2.syncState.mark(collection, key);
        ctx2.sync?.schedule();
      }
    });
    ctx2.analytics = new AnalyticsService(
      ctx2.db,
      () => ctx2.broadcast("analytics:changed", void 0)
    );
    await ctx2.analytics.load();
    ctx2.auth = new AuthService(root, (state) => {
      ctx2.broadcast("auth:changed", state);
      if (state.account) void ctx2.sync?.sync().then((outcome2) => ctx2.afterSync(outcome2));
      else ctx2.syncState.reset();
    });
    await ctx2.auth.load();
    ctx2.sync = new SyncEngine(
      ctx2.db,
      ctx2.auth,
      ctx2.syncState,
      (status) => ctx2.broadcast("sync:changed", status),
      (settings) => ctx2.broadcastSettings(settings)
    );
    ctx2.sessions = new SessionService(ctx2.db, {
      onTick: (tick) => {
        ctx2.broadcast("session:tick", tick);
        ctx2.tickTray(tick.remainingMs, tick.paused);
      },
      onChanged: (state) => {
        ctx2.broadcast("session:changed", state);
        ctx2.refreshTray();
        if (state === null) {
          ctx2.sync?.suspendPush(false);
          ctx2.syncNow();
        }
      },
      onToast: (text) => ctx2.broadcast("hud:toast", { text }),
      onDaysTouched: (dates) => void ctx2.analytics.touchDays(dates),
      onStarted: () => {
        ctx2.stages.clear();
        ctx2.sync?.suspendPush(true);
      },
      onCompleted: (session, threadTitle) => {
        ctx2.onFocusCompleted(
          session.threadId,
          threadTitle,
          session.activeMs
        ).catch((error) => console.error("[cycle]", error));
      }
    });
    ctx2.stages = new StageController(
      {
        onChanged: (state) => ctx2.broadcast("stage:changed", state),
        onTick: (tick) => ctx2.broadcast("stage:tick", tick),
        onStageEnded: (finished, next) => ctx2.announceStage(finished, next),
        onStartFocus: async (threadId) => {
          await ctx2.sessions.start(threadId);
        }
      },
      () => ctx2.db.settings.get().defaultSessionMs
    );
    ctx2.planner = new PlannerService(ctx2.db, ctx2.auth);
    ctx2.calendar = new CalendarService(ctx2.db, ctx2.auth);
    ctx2.now = new NowService(ctx2.db, ctx2.sessions, (nudge) => ctx2.announceBlock(nudge));
    ctx2.now.start();
    ctx2.planner.attachSync(ctx2.sync);
    ctx2.planner.onFinished = (error, weekKey2) => {
      ctx2.broadcast("planner:runFinished", { weekKey: weekKey2, error });
      void ctx2.announceWeekPlan(weekKey2);
    };
    ctx2.overlay = new CelebrationOverlay();
    ctx2.celebrations = new CelebrationOrchestrator(
      ctx2.db,
      ctx2.overlay,
      () => ctx2.analytics.summary("day", ctx2.db.clock.today()),
      () => nativeTheme.shouldUseHighContrastColors || preferReducedMotion()
    );
    await ctx2.db.threads.archiveStale();
    return ctx2;
  }
  // -------------------------------------------------------------- windows
  openMainWindow() {
    if (this.main && !this.main.isDestroyed()) {
      this.main.show();
      return;
    }
    this.main = createMainWindow({
      onHide: () => this.refreshTray(),
      onBlur: () => void this.db.store.flush(),
      onFocus: () => this.syncNow()
    });
    this.main.on("closed", () => {
      this.main = null;
    });
  }
  openHud() {
    if (this.hud && !this.hud.isDestroyed()) {
      this.hud.show();
      return;
    }
    const saved = this.db.settings.get().hudBounds;
    this.hud = createHudWindow(saved, (position) => {
      void this.db.settings.update({ hudBounds: position });
    });
    this.hud.on("closed", () => {
      this.hud = null;
    });
  }
  /**
   * Open the floating calendar, or close it if it is already up.
   *
   * A toggle rather than an open, because it is reached from one button and one tray item and
   * both of those read as "show me the calendar" — pressing again when it is already there and
   * having nothing happen is the behaviour people report as a broken button. Returns whether it
   * is now open, so the caller can render the button's state from the truth rather than guess.
   */
  toggleCalendarWidget() {
    if (this.calendarWidget && !this.calendarWidget.isDestroyed()) {
      this.closeCalendarWidget();
      return false;
    }
    const saved = this.db.settings.get().calendarBounds ?? defaultCalendarBounds();
    this.calendarWidget = createCalendarWindow(saved, (bounds) => {
      void this.db.settings.update({ calendarBounds: bounds });
    });
    this.calendarWidget.on("closed", () => {
      this.calendarWidget = null;
    });
    return true;
  }
  closeCalendarWidget() {
    if (this.calendarWidget && !this.calendarWidget.isDestroyed()) {
      this.calendarWidget.close();
    }
    this.calendarWidget = null;
  }
  resetHud() {
    if (this.hud && !this.hud.isDestroyed()) {
      this.hud.close();
      this.hud = null;
    }
    this.hud = createHudWindow(defaultHudPosition(), (position) => {
      void this.db.settings.update({ hudBounds: position });
    });
    this.hud.on("closed", () => {
      this.hud = null;
    });
  }
  closeHud() {
    if (this.hud && !this.hud.isDestroyed()) this.hud.close();
    this.hud = null;
  }
  setupTray(onQuit) {
    this.tray = createTray({
      onShow: () => this.openMainWindow()
    });
    this.refreshTray();
  }
  /** The once-a-second path. Title only, and only when the minute has actually turned over. */
  tickTray(remainingMs, paused) {
    if (!this.tray || this.tray.isDestroyed()) return;
    updateTrayCountdown(this.tray, {
      running: true,
      paused,
      remainingMs
    });
  }
  async refreshTray() {
    if (!this.tray || this.tray.isDestroyed()) return;
    const state = await this.sessions.state();
    const trayState = {
      running: state !== null,
      paused: state?.paused ?? false,
      threadTitle: state?.threadTitle ?? null,
      remainingMs: state?.remainingMs ?? 0
    };
    updateTray(this.tray, trayState, {
      onShow: () => this.openMainWindow(),
      onPauseResume: () => {
        void (async () => {
          const current = await this.sessions.state();
          if (!current) return;
          if (current.paused) await this.sessions.resume();
          else await this.sessions.pause();
        })();
      },
      onEnd: () => void this.sessions.end(),
      onToggleCalendar: () => this.toggleCalendarWidget(),
      // Quit must quit. Closing the main window here left the app resident forever: the
      // tray menu is rebuilt by every refresh, so this hook — not setupTray's — is the one
      // the user's Quit click actually ran.
      onQuit: () => {
        markQuitting();
        app.quit();
      }
    });
  }
  // ------------------------------------------------------------- the 25/5 cycle
  /**
   * A focus block ran to the end: log it to today, mark it with the short celebration, then
   * park on the break and wait. A thread that was completed *by* this session is skipped —
   * it gets the full celebration instead, and there is nothing left to take a break from.
   */
  async onFocusCompleted(threadId, threadTitle, activeMs) {
    const thread = await this.db.threads.get(threadId);
    if (thread?.status === "done") return;
    this.stages.awaitBreak(threadId, threadTitle);
    const day = await this.db.days.addLogEntry(
      `Focus block on ${threadTitle} — ${formatDuration(activeMs)}`,
      "focus"
    );
    this.broadcastDay(day);
    await this.celebrations.celebrateSession(threadTitle, activeMs);
  }
  /** Stage end: the HUD pops, glows and shakes, and the OS says so too (§4). */
  announceStage(finished, next) {
    this.showHudNow();
    this.broadcast("hud:attention", { stage: finished });
    if (!Notification.isSupported()) return;
    const body = next === "break" ? "Five minutes. Press Resume when you want to start it." : "Ready when you are — press Resume to start the next block.";
    new Notification({
      title: finished === "focus" ? "Focus block done" : "Break over",
      body,
      silent: true
    }).show();
  }
  /**
   * A plan block's start crossed the clock while nothing was running. The HUD pops with the
   * block's name, and the OS notification's click lands on the Daily page — from noticing to
   * starting is two clicks, and the second one is the block's own Start button.
   */
  announceBlock(nudge) {
    this.showHudNow();
    this.broadcast("hud:toast", { text: `Now: ${nudge.block.title}` });
    if (!Notification.isSupported()) return;
    const notification = new Notification({
      title: `Now: ${nudge.block.title}`,
      body: nudge.block.why ? `Until ${nudge.block.end} — ${nudge.block.why}` : `Until ${nudge.block.end}.`,
      silent: true
    });
    notification.on("click", () => {
      this.openMainWindow();
      this.broadcast("planner:nudge", {
        localDate: nudge.localDate,
        blockId: nudge.block.id,
        threadId: nudge.block.threadId ?? null
      });
    });
    notification.show();
  }
  /** Brings the HUD back into view without stealing keyboard focus from what you were doing. */
  showHudNow() {
    this.openHud();
    if (this.hud && !this.hud.isDestroyed()) this.hud.showInactive();
  }
  // -------------------------------------------------------------- lifecycle
  onMainReady() {
    this.mainReady = true;
    if (this.pendingRecovery)
      this.broadcast("session:recovery", this.pendingRecovery);
  }
  async checkRecovery() {
    const open = await this.sessions.findRecoverable();
    if (!open) return;
    const thread = await this.db.threads.get(open.threadId);
    const offer = {
      sessionId: open.id,
      threadTitle: thread?.title ?? "Untitled",
      activeMs: open.activeMs
    };
    this.pendingRecovery = offer;
    if (this.mainReady) this.broadcast("session:recovery", offer);
  }
  /**
   * A pull that changed anything has to reach the windows, or the board sits there showing
   * what the laptop knew before the phone told it otherwise.
   */
  afterSync(outcome2) {
    if (!outcome2 || outcome2.pulled === 0) return;
    this.broadcastThreads();
    this.broadcast("carry:changed", void 0);
    this.broadcast("analytics:changed", void 0);
    void this.db.days.today().then((day) => {
      if (day) this.broadcastDay(day);
    });
    const today = this.db.clock.today();
    void this.db.dayRuns.get(today).then((run) => {
      this.broadcast("dayrun:changed", { localDate: today, run });
    });
    void this.analytics.rebuild();
  }
  /** Foreground, sign-in, session end: the three moments worth a round trip immediately. */
  syncNow() {
    void this.sync?.sync().then((outcome2) => this.afterSync(outcome2));
  }
  async shutdown() {
    this.stages.destroy();
    this.now.stop();
    this.sync.stop();
    await this.syncState.flush();
    if (this.sessions.isRunning()) await this.sessions.end("ended_early");
    await this.analytics.flush();
    await this.db.close();
    this.overlay.destroy();
  }
  microTick() {
    microTickVariant = (microTickVariant + 1) % 3;
    this.broadcast("micro:tick", { variant: microTickVariant });
  }
  // --------------------------------------------------------------- broadcast
  broadcastThreads() {
    void this.db.threads.list().then((threads) => this.broadcast("threads:changed", threads));
  }
  broadcastDay(day) {
    this.broadcast("day:changed", day);
  }
  broadcastSettings(settings) {
    this.broadcast("settings:changed", settings);
  }
  /**
   * Every goal write funnels through here, so the handler that made the change and every
   * window that did not both end up looking at the same list.
   */
  async broadcastGoals(weekKey2) {
    const goals = await this.db.goals.list(weekKey2);
    this.broadcast("goals:changed", { weekKey: weekKey2, goals });
    return goals;
  }
  /** Read a week's plan back off disk and tell every window about it. */
  async announceWeekPlan(weekKey2) {
    const [week, days] = await Promise.all([
      this.db.plans.getWeek(weekKey2),
      this.db.plans.listWeekDays(weekKey2)
    ]);
    this.broadcast("planner:weekChanged", { weekKey: weekKey2, week, days });
    for (const plan of days) {
      this.broadcast("planner:changed", { localDate: plan.localDate, plan });
    }
  }
  async plannerState() {
    const today = this.db.clock.today();
    const weekKey2 = weekKeyOf(today);
    const auth = this.auth.state();
    return {
      availability: {
        signedIn: Boolean(auth.account),
        // Unknown until the first `/auth/me`, and an older backend does not send it at
        // all. Assumed ready in that case: a button that works is a better wrong guess
        // than one greyed out against a server that would have answered.
        serverReady: auth.account?.plannerAvailable !== false
      },
      spend: await this.db.plans.spend(today.slice(0, 7)),
      model: this.db.settings.get().plannerModel,
      weekKey: weekKey2,
      daysLeft: remainingWeekDates(today).length,
      week: await this.db.plans.getWeek(weekKey2)
    };
  }
  syncStatus() {
    return this.sync.status();
  }
  broadcast(channel, payload) {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue;
      window.webContents.send(channel, payload);
    }
  }
}
function preferReducedMotion() {
  return false;
}
function classifyLink(raw) {
  const value = raw.trim();
  if (!value) return "invalid";
  if (value.startsWith("notion://")) return "notion";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "url";
    const host = url.hostname.toLowerCase();
    if (host === "notion.so" || host.endsWith(".notion.so") || host.endsWith("notion.site")) {
      return "notion";
    }
    return "url";
  } catch {
    return "invalid";
  }
}
function notionDesktopUrl(raw) {
  const value = raw.trim();
  if (value.startsWith("notion://")) return value;
  if (classifyLink(value) !== "notion") return null;
  try {
    const url = new URL(value);
    return `notion://${url.host}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
function normaliseLink(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return `https://${value}`;
}
const DESKTOP_HANDOFF_MS = 1200;
async function openLink(raw) {
  const url = normaliseLink(raw);
  if (!url) return;
  if (classifyLink(url) === "invalid") return;
  const desktop = notionDesktopUrl(url);
  if (!desktop) {
    await shell.openExternal(url);
    return;
  }
  try {
    await Promise.race([
      shell.openExternal(desktop),
      new Promise(
        (_resolve, reject) => setTimeout(() => reject(new Error("notion handoff timed out")), DESKTOP_HANDOFF_MS)
      )
    ]);
  } catch {
    if (desktop !== url) await shell.openExternal(url);
  }
}
function launchesAtStartup() {
  if (!app.isPackaged) return false;
  return app.getLoginItemSettings().openAtLogin;
}
function setLaunchAtStartup(enabled) {
  if (!app.isPackaged) return false;
  app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true });
  return launchesAtStartup();
}
function minutesNow(timezone) {
  const formatted = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone
  }).format(/* @__PURE__ */ new Date());
  const [hour = 0, minute = 0] = formatted.split(":").map(Number);
  return hour * 60 + minute;
}
function planShell(settings) {
  return {
    wakeTime: settings.wakeTime,
    startTime: settings.dayStartTime,
    endTime: settings.dayEndTime
  };
}
function on(channel, handler, ctx2) {
  ipcMain.handle(
    channel,
    (_event, payload) => handler(ctx2, payload)
  );
}
function registerHandlers(ctx2) {
  const { db, sessions, analytics, celebrations } = ctx2;
  on("threads:list", async () => db.threads.list(), ctx2);
  on("threads:get", async (_c, { id }) => db.threads.get(id), ctx2);
  on(
    "threads:create",
    async (_c, { title, notes }) => {
      const board = await db.threads.activeList();
      if (board.length >= ACTIVE_THREAD_CAP) {
        throw new Error(
          `At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`
        );
      }
      const thread = await db.threads.create(title, notes);
      ctx2.broadcastThreads();
      return thread;
    },
    ctx2
  );
  on(
    "threads:update",
    async (_c, { id, patch }) => {
      const thread = await ctx2.db.threads.get(id);
      if (!thread) throw new Error("thread not found");
      const saved = await db.threads.save({ ...thread, ...patch });
      ctx2.broadcastThreads();
      return saved;
    },
    ctx2
  );
  on(
    "threads:setStatus",
    async (_c, { id, status, waitingOn }) => {
      if (status !== "done" && status !== "dormant") {
        const board = await db.threads.activeList();
        if (board.length >= ACTIVE_THREAD_CAP && !board.some((t) => t.id === id)) {
          throw new Error(
            `At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`
          );
        }
      }
      const thread = await db.threads.setStatus(id, status, waitingOn);
      if (status === "done") {
        await onThreadCompleted(ctx2, thread.id);
      } else if (sessions.currentThreadId() === id) {
        await sessions.end("ended_early");
      }
      ctx2.broadcastThreads();
      return thread;
    },
    ctx2
  );
  on(
    "threads:remove",
    async (_c, { id }) => {
      if (sessions.currentThreadId() === id) await sessions.end("ended_early");
      await db.threads.remove(id);
      ctx2.broadcastThreads();
    },
    ctx2
  );
  on("threads:done", async (_c, query) => db.threads.donePage(query), ctx2);
  on(
    "threads:reorder",
    async (_c, { id, toIndex, status }) => {
      if (status && status !== "dormant") {
        const board = await db.threads.activeList();
        if (board.length >= ACTIVE_THREAD_CAP && !board.some((t) => t.id === id)) {
          throw new Error(
            `At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`
          );
        }
      }
      const written = await db.threads.reorderOnBoard(id, toIndex, status);
      ctx2.broadcastThreads();
      return written;
    },
    ctx2
  );
  on("goals:list", async (_c, { weekKey: weekKey2 }) => db.goals.list(weekKey2), ctx2);
  on("goals:weeks", async () => db.goals.weeks(), ctx2);
  on(
    "goals:add",
    async (_c, { title, weekKey: weekKey2 }) => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error("A goal needs a name.");
      const goal = await db.goals.add(trimmed, weekKey2);
      return ctx2.broadcastGoals(goal.weekKey);
    },
    ctx2
  );
  on(
    "goals:update",
    async (_c, { id, patch }) => {
      const goal = await db.goals.update(id, patch);
      return ctx2.broadcastGoals(goal.weekKey);
    },
    ctx2
  );
  on(
    "goals:toggle",
    async (_c, { id }) => {
      const goal = await db.goals.toggle(id);
      return ctx2.broadcastGoals(goal.weekKey);
    },
    ctx2
  );
  on(
    "goals:remove",
    async (_c, { id }) => {
      const goal = await db.goals.get(id);
      await db.goals.remove(id);
      return ctx2.broadcastGoals(goal?.weekKey ?? db.goals.currentWeek());
    },
    ctx2
  );
  on(
    "goals:reorder",
    async (_c, { id, toIndex }) => {
      const goal = await db.goals.get(id);
      await db.goals.reorder(id, toIndex);
      return ctx2.broadcastGoals(goal?.weekKey ?? db.goals.currentWeek());
    },
    ctx2
  );
  on(
    "goals:carryOver",
    async (_c, { id, toWeek }) => {
      const before = await db.goals.get(id);
      const goal = await db.goals.carryOver(id, toWeek);
      if (before && before.weekKey !== goal.weekKey) await ctx2.broadcastGoals(before.weekKey);
      return ctx2.broadcastGoals(goal.weekKey);
    },
    ctx2
  );
  on("planner:state", async () => ctx2.plannerState(), ctx2);
  on("planner:get", async (_c, { localDate: localDate2 }) => db.plans.get(localDate2), ctx2);
  on(
    "planner:week",
    async (_c, { weekKey: weekKey2 }) => ({
      week: await db.plans.getWeek(weekKey2),
      days: await db.plans.listWeekDays(weekKey2)
    }),
    ctx2
  );
  on("planner:generate", async (_c, request) => ctx2.planner.generate(request), ctx2);
  on(
    "planner:promoteBlock",
    async (_c, { localDate: localDate2, blockId }) => {
      const plan = await db.plans.get(localDate2);
      if (!plan) throw new Error("There is no plan for that day.");
      const block = plan.blocks.find((candidate) => candidate.id === blockId);
      if (!block) throw new Error("That block is no longer in the plan.");
      if (block.threadId) {
        const existing = await db.threads.get(block.threadId);
        if (existing) return { plan, thread: existing };
      }
      const board = await db.threads.activeList();
      if (board.length >= ACTIVE_THREAD_CAP) {
        throw new Error(
          `At most ${ACTIVE_THREAD_CAP} active threads. Finish one, or move one to the dormant zone.`
        );
      }
      const thread = await db.threads.create(block.title, block.why ?? "");
      const linked = await db.plans.linkBlock(localDate2, blockId, thread.id);
      ctx2.broadcast("planner:changed", { localDate: localDate2, plan: linked });
      ctx2.broadcastThreads();
      return { plan: linked, thread };
    },
    ctx2
  );
  on(
    "planner:clear",
    async (_c, { localDate: localDate2 }) => {
      await db.plans.remove(localDate2);
      ctx2.broadcast("planner:changed", { localDate: localDate2, plan: null });
    },
    ctx2
  );
  on(
    "planner:editBlock",
    async (_c, { localDate: localDate2, block }) => {
      const plan = await db.plans.editBlock(localDate2, block, planShell(db.settings.get()));
      ctx2.broadcast("planner:changed", { localDate: localDate2, plan });
      return plan;
    },
    ctx2
  );
  on(
    "planner:deleteBlock",
    async (_c, { localDate: localDate2, blockId }) => {
      const plan = await db.plans.deleteBlock(localDate2, blockId);
      ctx2.broadcast("planner:changed", { localDate: localDate2, plan });
      return plan;
    },
    ctx2
  );
  on(
    "planner:reorderBlocks",
    async (_c, { localDate: localDate2, blockIds }) => {
      const plan = await db.plans.reorderBlocks(localDate2, blockIds);
      ctx2.broadcast("planner:changed", { localDate: localDate2, plan });
      return plan;
    },
    ctx2
  );
  on(
    "planner:insertBlock",
    async (_c, { localDate: localDate2, index, block }) => {
      const plan = await db.plans.insertBlock(
        localDate2,
        index,
        block,
        planShell(db.settings.get())
      );
      ctx2.broadcast("planner:changed", { localDate: localDate2, plan });
      return plan;
    },
    ctx2
  );
  on(
    "planner:moveBlock",
    async (_c, { fromDate, toDate, blockId }) => {
      const moved = await db.plans.moveBlock(
        fromDate,
        toDate,
        blockId,
        planShell(db.settings.get())
      );
      ctx2.broadcast("planner:changed", { localDate: fromDate, plan: moved.from });
      ctx2.broadcast("planner:changed", { localDate: toDate, plan: moved.to });
      return moved;
    },
    ctx2
  );
  on("planner:generateDay", async (_c, request) => ctx2.planner.generateDay(request), ctx2);
  on("insight:get", async (_c, { periodKey }) => db.insights.get(periodKey), ctx2);
  on("insight:generate", async (_c, { scope }) => ctx2.planner.generateInsight(scope), ctx2);
  on("dayrun:get", async (_c, { localDate: localDate2 }) => db.dayRuns.get(localDate2), ctx2);
  on(
    "dayrun:start",
    async (_c, { localDate: localDate2 }) => {
      const run = await db.dayRuns.start(localDate2);
      ctx2.broadcast("dayrun:changed", { localDate: localDate2, run });
      return run;
    },
    ctx2
  );
  on(
    "dayrun:shift",
    async (_c, { localDate: localDate2, deltaMs, scope }) => {
      const plan = await db.plans.get(localDate2);
      if (!plan) throw new Error("There is no plan to shift.");
      const run = await db.dayRuns.get(localDate2);
      if (!run) throw new Error("The day has not been started.");
      const shifted = await db.dayRuns.save(
        applyShift(
          plan,
          run,
          deltaMs,
          minutesNow(db.settings.get().timezone),
          scope ?? "rest"
        )
      );
      ctx2.broadcast("dayrun:changed", { localDate: localDate2, run: shifted });
      return shifted;
    },
    ctx2
  );
  on(
    "dayrun:skip",
    async (_c, { localDate: localDate2, blockId }) => {
      const run = await db.dayRuns.skip(localDate2, blockId);
      ctx2.broadcast("dayrun:changed", { localDate: localDate2, run });
      return run;
    },
    ctx2
  );
  on(
    "dayrun:end",
    async (_c, { localDate: localDate2 }) => {
      const run = await db.dayRuns.end(localDate2);
      ctx2.broadcast("dayrun:changed", { localDate: localDate2, run });
      return run;
    },
    ctx2
  );
  on(
    "steps:add",
    async (_c, { threadId, text, afterStepId }) => {
      const thread = await db.threads.addStep(threadId, text, afterStepId);
      ctx2.broadcastThreads();
      return thread;
    },
    ctx2
  );
  on(
    "steps:toggle",
    async (_c, { threadId, stepId }) => {
      const thread = await db.threads.toggleStep(threadId, stepId);
      await analytics.touchDays([db.clock.today()]);
      ctx2.broadcastThreads();
      ctx2.microTick();
      return thread;
    },
    ctx2
  );
  on(
    "steps:update",
    async (_c, { threadId, stepId, text }) => {
      const thread = await db.threads.updateStep(threadId, stepId, text);
      ctx2.broadcastThreads();
      return thread;
    },
    ctx2
  );
  on(
    "steps:remove",
    async (_c, { threadId, stepId }) => {
      const thread = await db.threads.removeStep(threadId, stepId);
      ctx2.broadcastThreads();
      return thread;
    },
    ctx2
  );
  on(
    "steps:reorder",
    async (_c, { threadId, stepId, toIndex }) => {
      const thread = await db.threads.reorderStep(threadId, stepId, toIndex);
      ctx2.broadcastThreads();
      return thread;
    },
    ctx2
  );
  on("day:get", async (_c, { localDate: localDate2 }) => db.days.get(localDate2), ctx2);
  on("day:today", async () => db.days.today(), ctx2);
  on("day:list", async () => db.days.listDates(), ctx2);
  on(
    "day:setIntent",
    async (_c, { threadIds }) => {
      const day = await db.days.setIntent(threadIds);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "day:setNote",
    async (_c, { localDate: localDate2, note }) => {
      const day = await db.days.setNote(localDate2, note);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "day:setNow",
    async (_c, { now, localDate: localDate2 }) => {
      const day = await db.days.setNow(now, localDate2);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on("carry:list", async () => db.days.carryForward(), ctx2);
  on(
    "blocker:add",
    async (_c, { text, localDate: localDate2 }) => {
      const day = await db.days.addBlocker(text, localDate2);
      ctx2.broadcastDay(day);
      ctx2.broadcast("carry:changed", void 0);
      return day;
    },
    ctx2
  );
  on(
    "blocker:resolve",
    async (_c, { localDate: localDate2, blockerId }) => {
      const blocker = await db.days.findBlocker(localDate2, blockerId);
      const day = await db.days.resolveBlocker(localDate2, blockerId);
      if (blocker && !blocker.resolved) {
        ctx2.broadcastDay(await db.days.addLogEntry(`Unblocked: ${blocker.text}`, "manual"));
      }
      ctx2.broadcastDay(day);
      ctx2.broadcast("carry:changed", void 0);
      ctx2.microTick();
      return day;
    },
    ctx2
  );
  on(
    "blocker:remove",
    async (_c, { localDate: localDate2, blockerId }) => {
      const day = await db.days.removeBlocker(localDate2, blockerId);
      ctx2.broadcastDay(day);
      ctx2.broadcast("carry:changed", void 0);
      return day;
    },
    ctx2
  );
  on(
    "log:add",
    async (_c, { text, localDate: localDate2 }) => {
      const day = await db.days.addLogEntry(text, "manual", localDate2);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "log:remove",
    async (_c, { localDate: localDate2, entryId }) => {
      const day = await db.days.removeLogEntry(localDate2, entryId);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "todo:add",
    async (_c, { text, localDate: localDate2 }) => {
      const day = await db.days.addTodo(text, localDate2);
      ctx2.broadcastDay(day);
      ctx2.broadcast("carry:changed", void 0);
      return day;
    },
    ctx2
  );
  on(
    "todo:toggle",
    async (_c, { localDate: localDate2, todoId }) => {
      const before = await db.days.findTodo(localDate2, todoId);
      const day = await db.days.toggleTodo(localDate2, todoId);
      if (before && !before.done) {
        ctx2.broadcastDay(await db.days.addLogEntry(before.text, "todo"));
      }
      ctx2.broadcastDay(day);
      ctx2.broadcast("carry:changed", void 0);
      ctx2.microTick();
      return day;
    },
    ctx2
  );
  on(
    "todo:update",
    async (_c, { localDate: localDate2, todoId, text }) => {
      const day = await db.days.updateTodo(localDate2, todoId, text);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "todo:remove",
    async (_c, { localDate: localDate2, todoId }) => {
      const day = await db.days.removeTodo(localDate2, todoId);
      ctx2.broadcastDay(day);
      ctx2.broadcast("carry:changed", void 0);
      return day;
    },
    ctx2
  );
  on(
    "todo:reorder",
    async (_c, { localDate: localDate2, todoId, toIndex }) => {
      const day = await db.days.reorderTodo(localDate2, todoId, toIndex);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "todo:promote",
    async (_c, { localDate: localDate2, todoId }) => {
      const todo = await db.days.findTodo(localDate2, todoId);
      if (!todo) throw new Error("todo not found");
      const thread = await db.threads.create(todo.text);
      const day = await db.days.linkPromotedTodo(localDate2, todoId, thread.id);
      ctx2.broadcastDay(day);
      ctx2.broadcastThreads();
      ctx2.broadcast("carry:changed", void 0);
      return { day, thread };
    },
    ctx2
  );
  on(
    "thought:add",
    async (_c, { text, localDate: localDate2 }) => {
      const day = await db.days.addThought(text, localDate2);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "thought:remove",
    async (_c, { localDate: localDate2, thoughtId }) => {
      const day = await db.days.removeThought(localDate2, thoughtId);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on(
    "thought:note",
    async (_c, { localDate: localDate2, thoughtId, note }) => {
      const day = await db.days.noteThought(localDate2, thoughtId, note);
      ctx2.broadcastDay(day);
      return day;
    },
    ctx2
  );
  on("park:all", async () => db.days.allThoughts(), ctx2);
  on(
    "thought:process",
    async (_c, { localDate: localDate2, thoughtId, action }) => {
      const thought = await db.days.findThought(localDate2, thoughtId);
      if (!thought) throw new Error("thought not found");
      let thread = null;
      if (action === "thread") thread = await db.threads.create(thought.text);
      else if (action === "todo") await db.days.addTodo(thought.text);
      const day = await db.days.markThoughtProcessed(
        localDate2,
        thoughtId,
        action
      );
      ctx2.broadcastDay(day);
      if (thread) ctx2.broadcastThreads();
      return { day, thread };
    },
    ctx2
  );
  on(
    "session:start",
    async (_c, { threadId, plannedMs }) => sessions.start(threadId, plannedMs),
    ctx2
  );
  on("session:pause", async () => sessions.pause(), ctx2);
  on("session:resume", async () => sessions.resume(), ctx2);
  on(
    "session:end",
    async (_c, { outcome: outcome2 }) => {
      await sessions.end(outcome2);
      return null;
    },
    ctx2
  );
  on(
    "session:switch",
    async (_c, { threadId }) => sessions.switchTo(threadId),
    ctx2
  );
  on(
    "session:distraction",
    async (_c, { kind, note }) => sessions.logDistraction(kind, note),
    ctx2
  );
  on("session:state", async () => sessions.state(), ctx2);
  on(
    "session:forThread",
    async (_c, { threadId }) => db.sessions.forThread(threadId),
    ctx2
  );
  on(
    "session:resolveRecovery",
    async (_c, { sessionId, keep }) => {
      await sessions.resolveRecovery(sessionId, keep);
    },
    ctx2
  );
  on(
    "session:park",
    async (_c, { kind, note }) => {
      const grantMs = db.settings.get().distractionGraceMs;
      const text = note?.trim() || "Distracted";
      if (sessions.isRunning()) {
        await sessions.logDistraction(kind, note);
      } else if (ctx2.stages.grant(grantMs)) {
        ctx2.broadcast("hud:toast", { text: parkToast(grantMs) });
      } else {
        ctx2.broadcast("hud:toast", { text: "Parked." });
      }
      const day = await db.days.addThought(text);
      ctx2.broadcastDay(day);
    },
    ctx2
  );
  on("stage:state", async () => ctx2.stages.current(), ctx2);
  on("stage:resume", async () => ctx2.stages.resume(), ctx2);
  on("stage:skip", async () => ctx2.stages.skip(), ctx2);
  on(
    "stage:stop",
    async () => {
      ctx2.stages.stop();
      return null;
    },
    ctx2
  );
  on("calendar:get", async (c, request) => ({
    calendar: await c.calendar.local(request),
    source: "local"
  }), ctx2);
  on("calendar:refresh", async (c, request) => c.calendar.remote(request), ctx2);
  on("server:health", async () => ctx2.auth.checkHealth(), ctx2);
  on(
    "analytics:scope",
    async (_c, { scope, anchor }) => analytics.summary(scope, anchor),
    ctx2
  );
  on(
    "analytics:rebuild",
    async () => {
      await analytics.rebuild();
    },
    ctx2
  );
  on("settings:get", async () => db.settings.get(), ctx2);
  on(
    "settings:update",
    async (_c, { patch }) => {
      const settings = await db.settings.update(patch);
      const profileKeys = [
        "timezone",
        "wakeTime",
        "dayStartTime",
        "dayEndTime",
        "plannerContext",
        "plannerModel",
        "plannerEffort"
      ];
      if (profileKeys.some((key) => patch[key] !== void 0)) {
        ctx2.syncState.markProfile();
        ctx2.sync?.schedule();
      }
      ctx2.broadcastSettings(settings);
      return settings;
    },
    ctx2
  );
  on("auth:state", async () => ctx2.auth.state(), ctx2);
  on(
    "auth:register",
    async (_c, { email, password, displayName }) => {
      if (!email.includes("@")) throw new Error("That does not look like an email address.");
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters — a short phrase beats a clever word.`);
      }
      return ctx2.auth.register(email, password, displayName);
    },
    ctx2
  );
  on("auth:login", async (_c, { email, password }) => ctx2.auth.login(email, password), ctx2);
  on(
    "auth:emailStart",
    async (_c, { email }) => {
      if (!email.includes("@")) throw new Error("That does not look like an email address.");
      return ctx2.auth.emailStart(email);
    },
    ctx2
  );
  on("auth:emailVerify", async (_c, { email, code }) => ctx2.auth.emailVerify(email, code), ctx2);
  on(
    "auth:setPassword",
    async (_c, { ticket, password, displayName }) => {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new Error(`Use at least ${MIN_PASSWORD_LENGTH} characters — a short phrase beats a clever word.`);
      }
      return ctx2.auth.setPassword(ticket, password, displayName);
    },
    ctx2
  );
  on("auth:logout", async () => ctx2.auth.logout(), ctx2);
  on("auth:deleteAccount", async () => ctx2.auth.deleteAccount(), ctx2);
  on("auth:setServer", async (_c, { url }) => ctx2.auth.setServerUrl(url), ctx2);
  on("sync:status", async () => ctx2.syncStatus(), ctx2);
  on(
    "sync:now",
    async () => {
      const outcome2 = await ctx2.sync.sync();
      ctx2.afterSync(outcome2);
      return ctx2.syncStatus();
    },
    ctx2
  );
  on("link:open", async (_c, { url }) => openLink(url), ctx2);
  on("startup:get", async () => launchesAtStartup(), ctx2);
  on("startup:set", async (_c, { enabled }) => setLaunchAtStartup(enabled), ctx2);
  on(
    "data:repair",
    async () => {
      await db.store.reload();
      await analytics.rebuild();
      return { filesRead: db.store.fileCount, rollupsRebuilt: true };
    },
    ctx2
  );
  on(
    "data:export",
    async () => {
      const target = path.join(
        app.getPath("documents"),
        `adhd-superpower-export-${Date.now()}.json`
      );
      await db.store.exportTo(target);
      return { path: target };
    },
    ctx2
  );
  on(
    "data:reveal",
    async () => {
      shell.showItemInFolder(db.root);
    },
    ctx2
  );
  on(
    "window:mainReady",
    async () => {
      ctx2.onMainReady();
    },
    ctx2
  );
  on(
    "calendarWidget:toggle",
    async () => ctx2.toggleCalendarWidget(),
    ctx2
  );
  on(
    "calendarWidget:close",
    async () => {
      ctx2.closeCalendarWidget();
    },
    ctx2
  );
  on(
    "calendarWidget:scope",
    async (c, { scope }) => {
      await c.db.settings.update({ calendarWidgetScope: scope });
    },
    ctx2
  );
  on(
    "hud:show",
    async () => {
      ctx2.openHud();
    },
    ctx2
  );
  on(
    "hud:reset",
    async () => {
      ctx2.resetHud();
    },
    ctx2
  );
  on(
    "hud:hide",
    async () => {
      ctx2.hud?.hide();
    },
    ctx2
  );
  on(
    "celebration:done",
    async () => {
      celebrations.stop();
    },
    ctx2
  );
}
function parkToast(grantMs) {
  const minutes = Math.round(grantMs / 6e4);
  if (minutes <= 0) return "Parked.";
  return `Parked. ${minutes === 1 ? "A minute" : `${minutes} minutes`} back.`;
}
async function onThreadCompleted(ctx2, threadId) {
  const { db, sessions, analytics, celebrations } = ctx2;
  if (sessions.currentThreadId() === threadId) await sessions.end("completed");
  await db.days.logThread(threadId);
  await analytics.touchDays([db.clock.today()]);
  const thread = await db.threads.get(threadId);
  if (!thread) return;
  ctx2.broadcastDay(await db.days.addLogEntry(`Finished ${thread.title}`, "thread"));
  await celebrations.celebrate(thread);
}
function claimSingleInstance(onSecondInstance) {
  const acquired = app.requestSingleInstanceLock();
  if (!acquired) return false;
  app.on("second-instance", onSecondInstance);
  return true;
}
async function writeLockFile(root) {
  await promises.mkdir(root, { recursive: true });
  await promises.writeFile(
    path.join(root, ".lock"),
    `${JSON.stringify({ pid: process.pid, startedAt: (/* @__PURE__ */ new Date()).toISOString() }, null, 2)}
`,
    "utf8"
  );
}
async function clearLockFile(root) {
  await promises.rm(path.join(root, ".lock"), { force: true });
}
const gotLock = claimSingleInstance(() => {
  ctx?.openMainWindow();
});
if (!gotLock) {
  app.quit();
}
let ctx = null;
async function bootstrap() {
  applyDockIcon();
  const root = appDataRoot();
  await writeLockFile(root);
  ctx = await AppContext.create(root);
  registerHandlers(ctx);
  ctx.setupTray(() => app.quit());
  ctx.openMainWindow();
  ctx.openHud();
  await ctx.checkRecovery();
  void ctx.auth.revalidate();
  ctx.sync.start();
  ctx.syncNow();
  powerMonitor.on("suspend", () => void ctx?.db.store.flush());
  powerMonitor.on("lock-screen", () => void ctx?.db.store.flush());
}
app.on("ready", () => {
  if (!gotLock) return;
  void bootstrap();
});
app.on("window-all-closed", () => {
});
app.on("before-quit", () => {
  markQuitting();
});
let shuttingDown = null;
app.on("will-quit", (event) => {
  if (!ctx) return;
  if (shuttingDown) return;
  event.preventDefault();
  shuttingDown = ctx.shutdown().then(() => clearLockFile(appDataRoot())).catch((error) => console.error("[shutdown]", error)).finally(() => app.exit(0));
});
