# Weekly goals and the day planner — handoff spec

Written for the **backend** and **mobile** repos. The desktop client already implements
everything below; this describes the contract so the other two can mirror it property for
property, the way they already do for threads, days and sessions.

Read `BACKEND_REQUIREMENTS.md` first — every rule in it (offline-first writes, `updatedAt`
conflict resolution, tombstones, the wire format being deliberately not the local format) applies
here unchanged. This document only adds two collections and says what is different about them.

---

## Order of work

These are dependencies, not preferences:

1. **Backend** adds the two tables, extends `/sync` — nothing else can be shared until this
   exists.
2. **Desktop** adds `goals` and `plans` to `SyncState.TRACKED` and writes the wire mappers. Small
   change; the records are already shaped for it.
3. **Mobile** builds against synced data.

Mobile can start on local-only UI before step 1, but the goal list will be an island until the
server knows about goals — the desktop is where they are written today.

---

## 1. What these are

**A goal** is one line you tick, for one ISO week, plus optional freeform context. It is
deliberately *not* a thread: no status, no sessions, no checklist, no completion ceremony. The
context field exists for one consumer — the planner — and is never rendered in a collapsed list.

**A plan** is a generated suggestion for one day: an ordered list of time blocks, some of which
point at real threads, to-dos or goals. It is disposable. Regenerating replaces it.

### Why they are not stored on existing records

A plan was originally going to live on `Day`. It cannot: `dayIn()` in `src/main/sync/wire.ts`
constructs a `Day` field by field and drops anything it does not know about, so a plan on a `Day`
would be erased the first time another device pushed that day back. Same reasoning applies to any
new field on an existing synced record — **add a collection, not a field**, unless you are also
editing the wire mapper in all three repos at once.

---

## 2. Types

Verbatim from `src/shared/domain.ts`. Mirror the field names exactly.

```ts
interface Goal {
  id: string;                     // ULID
  title: string;                  // the checkbox line, one line
  done: boolean;
  context: string;                // markdown, freeform, usually empty. Never null.
  weekKey: string;                // ISO week key, "2026-W34" — see §3
  order: number;                  // sparse ordering: 1000, 2000, 3000
  createdAt: string;              // UTC ISO-8601
  updatedAt: string;
  completedAt?: string;
  completedLocalDate?: string;    // YYYY-MM-DD, stamped at write time, never re-derived
  carriedFromWeek?: string;       // set when rolled into a later week
  deletedAt?: string | null;      // tombstone
}

type PlanBlockKind = 'focus' | 'break' | 'admin' | 'meal' | 'buffer' | 'wind_down';

interface PlanBlock {
  id: string;
  start: string;                  // local wall clock "HH:MM", 24-hour. NOT a timestamp.
  end: string;
  kind: PlanBlockKind;
  title: string;
  why?: string;
  threadId?: string;              // resolves to a real record, or is absent
  todoId?: string;
  goalId?: string;
}

interface DayPlan {
  localDate: string;              // primary key, YYYY-MM-DD
  generatedAt: string;
  wakeTime: string;               // "HH:MM" — echoed back so a stale plan can explain itself
  startTime: string;
  endTime: string;
  blocks: PlanBlock[];
  headline: string;
  deferred: string[];             // what was consciously left out
  model: string;                  // e.g. "claude-opus-5"
  usage: { inputTokens: number; outputTokens: number; costUsd: number };
}
```

`start`/`end` being wall-clock strings rather than timestamps is deliberate. A plan is a shape for
a day, not a calendar: crossing a timezone should not slide every block, and a plan made at
09:00 in London still means 09:00 when read in Berlin.

---

## 3. Week keys — the one piece of real logic

`weekKey` is an **ISO week key**: `YYYY-Www`, e.g. `2026-W34`. Reference implementation and tests
are in `src/shared/week.ts` and `week.test.ts`. Port the tests, not just the code.

Two rules that are easy to get wrong and silent when you do:

- **The year is the ISO week-numbering year, not the calendar year.** They disagree for about
  five days annually. `2027-01-01` belongs to `2026-W53`; `2024-12-30` belongs to `2025-W01`.
  Deriving the year with `localDate.slice(0, 4)` splits one week of goals across two years.
- **Weeks start Monday and always have exactly seven days.** Sunday `2026-08-23` is still
  `2026-W34`; Monday `2026-08-24` is `2026-W35`.

The cheap correct algorithm: take the Monday of the week, add 3 days to land on Thursday, and the
year of that Thursday is the ISO year — no January/December special cases.

Server-side, `week_key` is just a `text` column. Do not try to compute it in SQL; the client
sends it.

---

## 4. Schema

Follows the conventions in `BACKEND_REQUIREMENTS.md` §3.

```sql
create table goals (
  id                    text primary key,
  user_id               uuid not null references users(id) on delete cascade,
  title                 text not null,
  done                  boolean not null default false,
  context               text not null default '',
  week_key              text not null,
  board_order           double precision,      -- `order` is reserved, same rename as threads
  created_at            timestamptz not null,
  updated_at            timestamptz not null,
  completed_at          timestamptz,
  completed_local_date  date,
  carried_from_week     text,
  deleted_at            timestamptz
);
create index on goals (user_id, updated_at);
create index on goals (user_id, week_key);

create table plans (
  user_id      uuid not null references users(id) on delete cascade,
  local_date   date not null,
  generated_at timestamptz not null,
  wake_time    text not null,
  start_time   text not null,
  end_time     text not null,
  blocks       jsonb not null default '[]',
  headline     text not null default '',
  deferred     jsonb not null default '[]',
  model        text not null default '',
  usage        jsonb not null default '{}',
  updated_at   timestamptz not null,
  deleted_at   timestamptz,
  primary key (user_id, local_date)
);
create index on plans (user_id, updated_at);
```

`blocks` stays `jsonb` rather than a child table for the same reason `steps` does on threads: it
is always read and written whole, and nothing queries inside it.

`wake_time` etc. are `text`, not `time` — they are wall-clock labels, and a `time` column invites
a driver to attach a date and a zone to them.

---

## 5. Sync

Add `goals` and `plans` to the existing `/sync` request and response bodies. No new endpoints.

```jsonc
// GET /sync?since=<cursor>  →
{ "threads": [], "days": [], "sessions": [], "mindfulSessions": [],
  "goals": [], "plans": [], "seq": 1234 }

// POST /sync  ←
{ "goals": [], "plans": [] }   // alongside the existing collections
```

Same rules as everything else:

- **Last write wins on `updatedAt`.** Plans are the one place this is nearly free — a plan is
  disposable, so a lost merge costs a regeneration, not data.
- **Tombstones, never hard deletes.** `plans` needs `deleted_at` even though it is keyed by day,
  because "I threw today's plan away" must survive reaching another device.
- **A field the client does not understand is ignored, not fatal.** Both directions.

Wire naming, matching the existing mappers:

| Local | Wire |
| --- | --- |
| `order` | `boardOrder` |
| everything else | identical camelCase |

### Desktop changes when the server is ready

1. Add `COLLECTION.goals` and `COLLECTION.plans` to `TRACKED` in `src/main/sync/SyncState.ts`.
2. Write `goalOut`/`goalIn`/`planOut`/`planIn` in `src/main/sync/wire.ts`.
3. Add both to the pull/push branches in `SyncEngine.ts` — they already follow an obvious pattern
   for the four existing collections.

There is a test asserting neither collection currently enters the push queue
(`src/main/storage/goals.test.ts`, "never queues a goal or a plan for push"). **Update that test
when you do this** — it is a guard against leaking to a server that would reject the batch, and
it is meant to be removed deliberately, not to start failing mysteriously.

---

## 6. The planner itself

**Mobile should not implement its own planner call.** One key, one bill, one prompt. If the phone
needs to generate a plan, the right shape is a server endpoint that holds the key and does the
call, so there is one place the prompt lives and one place the spend is counted.

If that endpoint gets built, mirror these decisions from `PlannerService.ts` — each is there for
a reason:

- **Never automatic.** No cron, no on-open generation, no regeneration on data change. Every
  call is a button press, guarded against re-entry.
- **Cap the context.** All the limits are in `src/shared/constants.ts` (`PLANNER_MAX_GOALS`,
  `PLANNER_GOAL_CONTEXT_CHARS`, …). Uncapped input is how a one-cent call becomes a fifty-cent
  one.
- **Validate every id the model returns** against a real record and drop the ones that do not
  resolve. A block with a hallucinated `threadId` must lose its Start button, not gain one that
  starts nothing.
- **Stamp `model` and `usage` server-side/locally.** Never let the model report its own spend.
- **No prompt caching.** The prefix is under the ~1024-token minimum and generations are ~daily,
  so every read misses the TTL — caching costs the 1.25× write premium and never earns it back.

Measured cost, for budgeting: 1,581 input + 1,487 output tokens on Claude Opus 5 ≈ **$0.045** per
plan, ~25 seconds.

---

## 7. Mobile UI notes

The two decisions worth copying, both about the goal list:

- **The collapsed row is one line, always.** However much context is written, the row shows the
  checkbox, the title, and a small count (`¶ 3`) — never a preview. A weekly list that cannot be
  read at a glance stops being read.
- **Nothing carries forward on its own.** Rolling an unfinished goal into next week is an
  explicit per-goal action. An unfinished goal silently reappearing every Monday turns the list
  into a debt ledger, which is the one thing this app is built not to be.

For plans, the block list is read-only except for the Start action. Do not build editing — a plan
is cheap to regenerate and a half-edited plan is a document nobody trusts.
