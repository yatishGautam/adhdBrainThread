import { safeStorage, BrowserWindow, screen, app, nativeImage, shell, Tray, Menu, nativeTheme, Notification, ipcMain, powerMonitor } from "electron";
import { z } from "zod";
import { promises } from "node:fs";
import path from "node:path";
import "node:crypto";
import { toZonedTime, format } from "date-fns-tz";
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
  mindful: "mindful"
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
  })
];
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
  const shift = (utc.getUTCDay() + 6) % 7;
  return addLocalDays(localDate2, -shift);
}
function startOfLocalMonth(localDate2) {
  return `${localDate2.slice(0, 7)}-01`;
}
function endOfLocalMonth(localDate2) {
  const [y, m] = localDate2.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${localDate2.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}
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
  timezone: z.string(),
  lastOpenSessionId: z.string().optional()
});
function defaultSettings() {
  return {
    version: 1,
    defaultSessionMs: DEFAULT_SESSION_MS,
    distractionGraceMs: DEFAULT_DISTRACTION_GRACE_MS,
    soundEnabled: true,
    celebrationsEnabled: true,
    recentCelebrationIds: [],
    railCollapsed: false,
    timezone: systemTimezone()
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
  constructor(root, store, clock, threads, days, sessions, settings, migration) {
    this.root = root;
    this.store = store;
    this.clock = clock;
    this.threads = threads;
    this.days = days;
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
    const sessions = new SessionRepo(store);
    return new Database(root, store, clock, threads, days, sessions, settings, migration);
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
function weekMomentum(rollups, weekStart) {
  const days = localDateRange(weekStart, addLocalDays(weekStart, 6));
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
const MIN_PASSWORD_LENGTH = 10;
const DEFAULT_SERVER_URL = "https://api.adhd.yatishgautam.com";
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
        signal: AbortSignal.timeout(path2.startsWith("/sync") ? SYNC_TIMEOUT_MS : TIMEOUT_MS)
      });
    } catch (error) {
      throw new NetworkError(unreachable(this.baseUrl, error));
    }
    if (!response.ok) {
      throw new ApiError(response.status, await describe(response, path2));
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
async function describe(response, path2) {
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
const MAX_THREADS = 2e3;
const MAX_DAYS = 2e3;
const MAX_SESSIONS = 5e3;
class SyncEngine {
  constructor(db, auth, state, onChanged) {
    this.db = db;
    this.auth = auth;
    this.state = state;
    this.onChanged = onChanged;
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
    if (typeof response.seq === "number") this.state.advanceCursor(response.seq);
    return merged;
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
    const profileDirty = this.state.isProfileDirty;
    if (!threads.length && !days.length && !sessions.length && !sits.length && !profileDirty) {
      return { pushed: 0, conflicts: 0 };
    }
    let pushed = 0;
    let conflicts = 0;
    const batches = chunk(threads, days, sessions, sits);
    for (const [index, batch] of batches.entries()) {
      const body = {
        threads: batch.threads.map(threadOut),
        days: batch.days.map(dayOut),
        sessions: batch.sessions.map(sessionOut),
        mindfulSessions: batch.sits.map(mindfulOut)
      };
      if (index === 0 && profileDirty) {
        const displayName = this.auth.state().account?.displayName ?? null;
        body.profile = {
          timezone: this.db.settings.get().timezone,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          ...displayName ? { displayName } : {}
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
      default:
        return;
    }
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
function chunk(threads, days, sessions, sits) {
  const threadPages = pages(threads, MAX_THREADS);
  const dayPages = pages(days, MAX_DAYS);
  const sessionPages = pages(sessions, MAX_SESSIONS);
  const count = Math.max(1, threadPages.length, dayPages.length, sessionPages.length);
  return Array.from({ length: count }, (_unused, index) => ({
    threads: threadPages[index] ?? [],
    days: dayPages[index] ?? [],
    sessions: sessionPages[index] ?? [],
    sits: index === 0 ? sits.slice(0, MAX_SESSIONS) : []
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
  COLLECTION.mindful
];
class SyncState {
  constructor(root) {
    this.root = root;
  }
  cursor = 0;
  lastSyncedAt = null;
  profileDirty = false;
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
function loadRenderer(window, page) {
  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (devServer) {
    void window.loadURL(`${devServer}/${page === "index" ? "" : `${page}.html`}`);
  } else {
    void window.loadFile(path.join(here$2, `../renderer/${page}.html`));
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
const HUD_WIDTH = 470;
const HUD_HEIGHT = 106;
function defaultHudPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - HUD_WIDTH - 24),
    y: Math.round(workArea.y + workArea.height - HUD_HEIGHT - 24)
  };
}
function createHudWindow(saved, onMoved) {
  const position = saved ?? defaultPosition();
  const window = new BrowserWindow({
    width: HUD_WIDTH,
    height: HUD_HEIGHT,
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
  loadRenderer(window, "hud");
  return window;
}
function defaultPosition() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: Math.round(workArea.x + workArea.width - HUD_WIDTH - 24),
    y: Math.round(workArea.y + workArea.height - HUD_HEIGHT - 24)
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
function updateTray(tray, state, hooks) {
  const title = state.running ? `${state.paused ? "❙❙" : "●"} ${formatClock(state.remainingMs)}` : "";
  if (process.platform === "darwin") tray.setTitle(title);
  tray.setToolTip(
    state.threadTitle ? `ADHD Superpower — ${state.threadTitle}` : "ADHD Superpower"
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
  sync;
  syncState;
  main = null;
  hud = null;
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
      (status) => ctx2.broadcast("sync:changed", status)
    );
    ctx2.sessions = new SessionService(ctx2.db, {
      onTick: (tick) => ctx2.broadcast("session:tick", tick),
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
    void this.analytics.rebuild();
  }
  /** Foreground, sign-in, session end: the three moments worth a round trip immediately. */
  syncNow() {
    void this.sync?.sync().then((outcome2) => this.afterSync(outcome2));
  }
  async shutdown() {
    this.stages.destroy();
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
      if (patch.timezone !== void 0) ctx2.syncState.markProfile();
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
