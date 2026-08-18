# Backend requirements

A cloud service for ADHD Superpower: user accounts, and one copy of a user's data that every
device they own agrees on.

Nothing in this document exists yet. It describes what to build when the desktop app is stable
enough to be worth syncing, and it is written so the client changes it implies stay small.

---

## 1. The one constraint that shapes everything

**The app must work fully offline, and it must work online.** Not "degrade gracefully" — a
Pomodoro timer that stalls on a plane is broken, and this app is used on trains and in buildings
with bad wifi.

That rules out the obvious design. The tempting version is "swap the local store for an HTTP
client" — one interface, two implementations, done. It cannot be that, because then every read
blocks on a network and the app dies without one.

So:

> **Writes land locally first, always. The server is a durable merge point that the client
> replicates to when it can. It is never in the path between the user and their own data.**

The consequences, all of which are real work:

- The client is the source of truth *at write time*. The server is the source of truth *at merge
  time*. Both statements have to be true at once, and that is what a conflict rule is for.
- Every record needs a modification timestamp the server can compare. Arrival order is not good
  enough — a laptop that wakes after four days offline and flushes its queue must not overwrite
  newer edits made on a phone in the meantime.
- Deletes need tombstones. A delete that simply removes a row will be resurrected by the next
  device that syncs, because that device has never heard the row was deleted.
- The timer never touches the network. `SessionService` runs on a monotonic clock in the main
  process; a session is pushed once when it ends, never while it runs.

### What is explicitly not needed

- **CRDTs.** This is one person on two or three devices. Real simultaneous edits to the same
  record are close to nonexistent, and last-write-wins per record is correct and boring.
- **Realtime websockets, at first.** Refetching when the app comes to the foreground covers the
  actual use case (change something on the Mac, pick up the phone). Add push later if it earns
  its keep; the data model does not change.
- **Server-side business logic.** Momentum, rollups and insights are computed client-side today
  and should stay there. A server that recomputes them is a second implementation to keep in
  step with the first.

---

## 2. Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Runtime | Node 22 + TypeScript | Same language and domain types as the client; `src/shared/` can be imported directly rather than re-described. |
| Framework | Fastify | Fast, first-class TypeScript, schema-based validation built in. Express works; this is less ceremony. |
| Database | **PostgreSQL** | See below. |
| Access | Drizzle ORM | Typed queries, SQL-shaped, migrations as checked-in files. No hidden magic at 3am. |
| Validation | Zod | Already used for storage schemas in the client — the same schemas validate request bodies. |
| Auth | Lucia, or Auth.js | Session-based, self-hosted, no per-user pricing. |
| Hosting | Fly.io / Railway / Render | Container, a Postgres add-on, done. |

### Why Postgres

The data is relational (users → threads → steps → sessions), the queries are ordinary, and the
sync design needs one thing document stores make awkward: a reliable, monotonic, server-assigned
change sequence to pull "everything since X" against. Postgres gives that with a `bigserial` or a
logical clock column, plus transactions across tables when a push contains several kinds of
record at once.

SQLite via Turso is a legitimate cheaper alternative for a single-user tool. Mongo is a poor fit —
the shape is relational, and the sync cursor is harder to make correct.

---

## 3. Schema

Domain types live in `src/shared/domain.ts` and are the contract. Below is the storage shape;
every table carries the sync columns from §4.

```
users
  id              uuid pk
  email           text unique not null
  email_verified  boolean not null default false
  created_at      timestamptz not null default now()

-- Separated from `users` so auth can be swapped without touching profile data.
profiles
  user_id         uuid pk references users(id) on delete cascade
  display_name    text
  timezone        text not null            -- IANA, e.g. 'Europe/London'
  settings        jsonb not null           -- mirrors the client's Settings type
  updated_at      timestamptz not null

threads
  id              text pk                  -- client-generated ULID, not a server sequence
  user_id         uuid not null references users(id) on delete cascade
  title           text not null
  notes           text not null default ''
  status          text not null            -- in_progress | blocked | waiting | done | dormant
  waiting_on      text
  link            text
  board_order     double precision         -- sparse ordering; see stepOrder.ts
  steps           jsonb not null default '[]'
  completed_at    timestamptz
  completed_local_date  date
  total_focus_ms  bigint not null default 0
  session_count   integer not null default 0
  archived        boolean not null default false

days
  user_id         uuid not null references users(id) on delete cascade
  local_date      date not null
  now_text        text
  todos           jsonb not null default '[]'
  blockers        jsonb not null default '[]'
  log             jsonb not null default '[]'
  thoughts        jsonb not null default '[]'
  logged_thread_ids  jsonb not null default '[]'
  primary key (user_id, local_date)

sessions
  id              text pk                  -- ULID
  user_id         uuid not null references users(id) on delete cascade
  thread_id       text references threads(id) on delete set null
  started_at      timestamptz not null
  ended_at        timestamptz
  local_date      date not null            -- stamped by the client, never re-derived
  planned_ms      integer not null
  active_ms       integer not null
  granted_ms      integer not null default 0
  outcome         text not null
  distractions    jsonb not null default '[]'
```

### Notes on the shape

**Ids are client-generated ULIDs.** They must be, because a record is created offline and needs
an identity before the server has ever seen it. ULIDs sort lexicographically by creation time, so
they double as an ordering key and never collide across devices.

**`local_date` is stored, not derived.** The client stamps it at write time from the user's
timezone. Re-deriving a local day from a UTC timestamp on the server is how sessions land on the
wrong side of a DST boundary — the client already has a comment about this and the server must
not undo it.

**Steps, todos, blockers, log entries and thoughts stay as JSONB** rather than becoming tables.
They are only ever read and written with their parent, they are small, and normalising them
triples the number of things a sync push has to reconcile for no query benefit. Promote them to
tables only if something needs to query across them (e.g. "every to-do mentioning X").

**`sessions.distractions` is JSONB for the same reason** — nothing queries an individual
distraction, only aggregates per session or per day.

---

## 4. Sync

Three columns on every syncable table:

```
updated_at      timestamptz not null    -- client's modification time; the conflict rule
deleted_at      timestamptz             -- tombstone; NULL means live
seq             bigint not null         -- server-assigned, monotonic per user
```

`seq` comes from a per-user sequence bumped on every write. It is what `pull` filters against —
timestamps cannot be used as a cursor because clocks are not reliable and two records can share
a millisecond.

### Pull

```
GET /sync?since=<seq>
→ { threads: [...], days: [...], sessions: [...], profile: {...}, seq: <highest> }
```

Returns everything changed since the cursor, tombstones included, so the client learns about
deletions. The client stores the returned `seq` and sends it next time. `since=0` is a full
sync — a fresh device, or recovery.

### Push

```
POST /sync
{ threads: [...], days: [...], sessions: [...], profile: {...} }
→ { applied: [...ids], conflicts: [{ id, server: {...} }], seq: <highest> }
```

One transaction. Per record, last-write-wins on `updated_at`:

- incoming `updated_at` **newer** than stored → apply, bump `seq`
- incoming **older or equal** → reject, return the server's copy in `conflicts`
- record absent on the server → insert

The client applies returned conflicts over its local copy. Because it is one user, conflicts
should be vanishingly rare; when they happen, the newer edit winning is what a person expects.

**Deletes are `deleted_at = now()`, never `DELETE`.** A hard delete is resurrected by the next
device to sync. Purge tombstones older than ~90 days with a scheduled job, which is safely longer
than any device stays offline.

### Client side

- A queue of pending changes, persisted next to the data so it survives a quit.
- Push on: app foreground, network regained, and a debounce after a write.
- Pull on: app foreground, and after every successful push.
- **Never push during a running session.** `SessionService` ticks every second; the session is
  pushed once, on `end()`.

This is the one genuinely large piece of client work and it should be estimated as such.

---

## 5. Auth

Email + password, and Sign in with Apple. Apple is not optional if the iOS app ever offers any
other social login — App Store review requires it.

```
POST /auth/register      { email, password }        → session cookie
POST /auth/login         { email, password }        → session cookie
POST /auth/logout
GET  /auth/me                                       → { user, profile }
POST /auth/forgot        { email }
POST /auth/reset         { token, password }
DELETE /auth/account                                → cascades, hard-deletes everything
```

- Argon2id for password hashing. Not bcrypt, not SHA-anything.
- Opaque session tokens in an httpOnly, Secure, SameSite=Lax cookie. Desktop and mobile clients
  store the token in the OS keychain, not in a file next to the data.
- Long-lived sessions (90 days, rolling). This is a personal tool; being logged out weekly is a
  reason to stop using it.
- Rate-limit `/auth/*` per IP and per email.
- `DELETE /auth/account` must actually delete, tombstones and all. Required by both app stores.

**The client must work signed out.** Account is opt-in: local-only is a legitimate permanent
state, and the app should never gate a timer behind a login screen. Signing in later uploads
what already exists locally.

---

## 6. Endpoints beyond sync

Sync covers normal operation. These are for things sync cannot do.

```
GET    /health                          → liveness, for the platform
GET    /export                          → the user's entire dataset as one JSON file
POST   /import                          → restore from an export
PATCH  /profile                         { display_name?, timezone?, settings? }
```

No per-thread or per-day REST endpoints. Adding `POST /threads` invites a client to write
directly to the server, which is exactly the online-only path that breaks offline. One sync
endpoint is the whole write surface, deliberately.

---

## 7. Non-functional

- **Every query filtered by `user_id`.** Enforced in a repository layer, not left to each
  handler to remember. This is the single most likely place to leak another user's data.
- **Request size cap** (~5MB). A first sync from a heavy three-year-old client is the largest
  thing this ever handles; chunk beyond that.
- **Idempotent push.** Retrying after a timeout must not double-apply — natural here, since
  applying the same record twice with the same `updated_at` is a no-op the second time.
- **Structured logging** with `user_id` and request id. Never log record contents; a thread title
  is personal.
- **Backups**: daily automated Postgres snapshots, 30-day retention, and a restore that has
  actually been tested at least once.
- **Migrations** as checked-in files, applied on deploy, always additive — never rename or
  repurpose a column. An iOS build sits in App Review for days while the desktop app updates
  instantly, so old clients will always be talking to a newer server.

---

## 8. Build order

1. Auth, profiles, health. Deploy it. Log in from a script.
2. Schema and migrations for the three tables plus the sync columns.
3. `GET /sync` and `POST /sync`, tested against fixtures before any client touches them.
4. Client: `SyncEngine` alongside `JsonStore` — queue, push, pull, apply. Local storage
   unchanged, which is the point.
5. Export/import.
6. Realtime push, only if foreground refetch proves insufficient.

---

## 9. What this changes in the client

Less than it looks, because the seam is already there.

- `src/main/storage/Store.ts` is the interface every repository talks to, and `JsonStore` is
  the only implementation. **`JsonStore` stays** — the sync engine sits alongside it, not behind
  it.
- Records need `updatedAt` on every table. `Thread` has it. `Day` does not — it has only
  `createdAt` and needs one adding. `Session` can use `endedAt ?? startedAt`.
- `ThreadRepo.remove()` currently hard-deletes and must write a tombstone instead.
- Nothing in `src/main/services/` or `src/renderer/` should need to change at all.
