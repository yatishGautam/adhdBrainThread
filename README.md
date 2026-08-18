# ADHD Superpower

A desktop focus companion for ADHD working sessions. Electron + React + TypeScript.
Local-first, file-backed, no server, no account.

This project began as FocusBar, a simple Pomodoro timer (kept for reference in `legacy/`), and
was rebuilt into ADHD Superpower following the full product spec: a threads board instead of a task list,
a floating always-on-top HUD, a momentum system that replaces streaks, and a celebration overlay
— all backed by a hand-rolled JSON storage engine instead of a database.

## Design principles

- **One thing is on screen at a time.** The board is an inventory; the HUD is the product.
- **Starting is the behaviour being reinforced, not finishing.** A 4-minute abandoned session
  still counts toward momentum.
- **Nothing accumulates as debt.** No streak that can break. No overdue counters.
- **Blocked is not failure.** `waiting` is a calm status, and `blocked` is muted clay rather
  than red — it is the status you can act on least, so it must not be an alarm you can't switch off.
- **Parking a distraction costs zero points and adds time back to the clock** — the moment
  self-reporting feels expensive, people stop doing it.
- **A stage never starts itself.** The timer waits for you between blocks. A Pomodoro app that
  runs without you is one you stop trusting.
- **A day exists because you used it.** Days are never manufactured to feel bad about.
- **The data is the user's.** Plain JSON, pretty-printed, sorted keys, git-friendly.

## The app

Three tabs — **Threads · Daily · Dashboard** — plus a collapsible sidebar that groups past days
year → month → day and stars weekends.

**Threads** is the board. Up to five active threads (done and dormant don't count), each with a
name, an optional Notion or web link chip, a next step, a status, and a collapsible checklist
drawer with live progress. Drag to reorder, or into the dormant zone. **Just start** launches a
Pomodoro on the top thread with no decision to make — starting is the hard part, so choosing is
one decision too many.

**Daily** is one column, always the same shape: NOW, today's threads, to-do, blockers, Wins,
Park. To-dos and blockers are global and carry forward until done, each showing when it was
raised. Wins is the day's victory list and writes itself. Park is a scratch inbox — a rapid
capture for stray thoughts, with a full page (from the dashboard stat or the panel's *View all*)
where you can annotate, promote or delete them later.

Every day is editable, not just today, and a to-do or a win is enough to bring one into
existence. Threads are not required for a day to be real.

**Dashboard** keeps the momentum system — a rolling score that dents rather than resets — and
adds plain counts: steps completed, average and longest block, when you actually start work, and
all-time totals.

**The HUD** is a small frameless always-on-top window running a 25/5 cycle with manual advance.
When a stage ends the timer parks on the next one, glows and chimes, and waits for Resume.
**Park** logs a distraction, writes it to today's Park list, and adds two minutes back.

## The other two repos

This app is the source of the domain model; the other two mirror it property for property, so
the same record round-trips through all three without a translation layer.

| | |
| --- | --- |
| [`adhd-webapp`](../adhd-webapp) | the sync backend — accounts, and one copy of the data every device agrees on |
| [`adhd-mobileapp`](../adhd-mobileapp) | the iOS client |

## Run it

```bash
npm install
npm run dev
```

`electron-vite dev` starts all three renderers (main window, HUD, celebration overlay) with HMR.

## Accounts

There is an account, and it is optional. Everything works signed out; signing in is what will
let the same threads and days appear in [`adhd-mobileapp`](../adhd-mobileapp). It is reached
from the bottom of the side rail, never from a launch screen — an app that opens onto a sign-in
form is an app that failed on the day you had no signal.

- `AuthService` is the only holder of the session token, and it writes it **encrypted with the
  OS keychain** (Electron `safeStorage`) into `account.json`, never in plain text. No keychain
  available, no persistence: the token stays in memory for that run and you sign in again next
  launch, which is better than a plain-text token on disk.
- `ApiClient` turns every status code into a sentence meant for a person before it leaves the
  main process, so the renderer never interprets an HTTP code.
- **Only a `401` signs you out.** A server that cannot be reached leaves you signed in and
  marked offline, because the token is fine and the network is not.
- Boot never waits on the network: `revalidate()` checks the token against `/auth/me` in the
  background, after the window is already up.

It talks to `https://api.adhd.yatishgautam.com` by default — `DEFAULT_SERVER_URL` in
`src/shared/auth.ts`. Point it at a local backend with `ADHD_API_URL`, or from the Server field
in the account dialog:

```bash
cd ../adhd-webapp && npm run dev:up && npm run dev     # postgres on 55432, API on 8099
ADHD_API_URL=http://localhost:8099 npm run dev
```

Syncing the records themselves is the next piece of work — the account exists and the token is
held; nothing calls `/sync` from this app yet.

## Test

```bash
npm test
```

69 unit tests covering the storage engine (kill-mid-write, corrupt-file quarantine, migration
from the old sharded layout), the momentum/insight math, celebration pack selection, the 25/5
stage cycle, sparse step ordering, and Notion link classification.

Five more talk to a real backend and **skip themselves when none is reachable**, so the suite
still passes on a laptop with nothing running — they are the only proof that this client and
that server agree, rather than that this client agrees with a fixture it wrote itself:

```bash
ADHD_TEST_API=http://localhost:8099 npm test
```

Registration is rate limited to five per hour and those tests spend two, so a tight loop of
reruns starts seeing 429s. Restart the API; the limiter counts in memory.

## Build

```bash
npm run build      # typecheck + electron-vite build
npm run dist:mac    # packaged .dmg / .zip via electron-builder
```

## Architecture

The main process is the single owner of all state and the only process that touches disk.
Renderers hold derived view state and send intents over a fully typed IPC bridge
(`src/shared/ipc/channels.ts`) — a channel added on one side and forgotten on the other is a
compile error, not a runtime surprise.

```text
src/
  shared/            domain model, IPC contract, constants, formatting, link handling
  main/
    storage/         JsonStore: atomic writes, repair/quarantine, migration, repositories
    services/        SessionService (monotonic clock), StageController (the 25/5 cycle),
                      AnalyticsService (momentum/rollups), CelebrationOrchestrator,
                      momentum math, insight cards, link opening, login item
    windows/          main window, HUD, celebration overlay (one per display), tray
    ipc/              every IPC handler, keyed by channel name
  preload/            contextBridge, typed API surface
  renderer/
    main-window/       Threads / Daily / Dashboard tabs, Park view, Zustand stores
    hud/                floating timer window
    celebration/        overlay + pack registry (one file to touch when adding a pack)
```

### Sessions and the 25/5 cycle

`SessionService` owns the authoritative clock, driven by monotonic deltas in the main process —
the renderer never owns the countdown, and the wall clock is metadata only.

`StageController` handles what happens between blocks. A break is deliberately **not** a
`Session` record: breaks are not focus and never reach the dashboard. When a focus block
completes, the break is parked *first* — before logging or celebrating — so a slow or failing
celebration can't strand the cycle.

### Storage

This used to be a size-sharded engine with a manifest index, lazy loading and a write-ahead
journal. It was replaced by `JsonStore`, which is plain files written atomically.

The sharding existed to keep years of records addressable without holding them all in one
process. In practice a personal dataset is a few megabytes — the machinery was paying rent
without earning it, and a manifest that can disagree with the files it indexes is a class of bug
that a single file simply does not have.

What survived, because it was doing real work:

- **atomic writes** — write to a temp file and rename, so a kill mid-write leaves the previous
  file intact rather than a truncated one
- **quarantine, never delete** — a file that fails to parse or validate is renamed aside. The
  data is the user's, and a copy on disk is what makes a bug reportable
- **pretty-printed, sorted keys** — the export stays diffable and git-friendly
- **sparse ordering** (1000, 2000, 3000) for steps, todos and the board, so a drag-reorder writes
  one record's `order` field rather than the whole list

Every schema addition is optional, so files written by earlier versions keep parsing.
`migrate.ts` folds an existing sharded layout into the new one on first run, skipping any shard
it cannot parse rather than failing the whole migration.

See `src/main/storage/JsonStore.ts` and `migrate.ts` with their test suites.

## Status

Implemented and verified end-to-end by driving the running app (storage → IPC → main window →
HUD → celebration overlay, zero console exceptions): the storage engine, threads board, the
25/5 HUD, the daily page, global carry-forward to-dos and blockers, the Park view, Notion link
handling, celebrations on every display, and the dashboard.

Accounts are verified the same way, against a real backend rather than a mock — create, the
under-length password refusal, the duplicate email, sign out, wrong password, sign back in, and
the token surviving a full restart out of the OS keychain.

Deferred to a later pass: the settings screen, data export/repair UI, keyboard shortcuts, and a
full sound design pass. The underlying IPC handlers for repair/export already exist
(`data:repair`, `data:export`) — only the UI is missing. Session length is therefore still fixed
at 25 minutes unless `settings.json` is edited by hand, even though the dashboard computes and
displays a suggested length.

### Known trade-offs

- **The storage engine is heavier than this app needs.** A manifest, journal and sharding layer
  for a single user's JSON is why a new field costs edits in five files. It works and is well
  tested, so it stays — but it's the first thing to simplify if this grows a backend.
- **`out/` and the `.tsbuildinfo` files are tracked in git.** Build output in version control
  makes every diff enormous. Worth gitignoring, but doing so means committing a build that
  references asset filenames no longer present.
