# ADHD Superpower

A desktop focus companion for ADHD working sessions. Electron + React + TypeScript.
Local-first and file-backed: it works fully offline with no account, and syncs across devices
if you make one.

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
- **Nothing spends money without you pressing something.** The week planner is the only feature
  that reaches a paid API. It never runs on a schedule, on boot, or on a data change, and what it
  has cost is on screen next to the button.
- **The data is the user's.** Plain JSON, pretty-printed, sorted keys, git-friendly.

## The app

Five tabs — **Threads · Daily · Week · Calendar · Dashboard** — plus a collapsible sidebar that
groups past days year → month → day and stars weekends.

**Threads** is the board. Up to five active threads (done and dormant don't count), each with a
name, an optional Notion or web link chip, a next step, a status, and a collapsible checklist
drawer with live progress. Drag to reorder, or into the dormant zone. **Just start** launches a
Pomodoro on the top thread with no decision to make — starting is the hard part, so choosing is
one decision too many.

**Daily** is one column, always the same shape: NOW, the suggested day, today's threads, to-do,
blockers, Wins, Park. To-dos and blockers are global and carry forward until done, each showing when it was
raised. Wins is the day's victory list and writes itself. Park is a scratch inbox — a rapid
capture for stray thoughts, with a full page (from the dashboard stat or the panel's *View all*)
where you can annotate, promote or delete them later.

Every day is editable, not just today, and a to-do or a win is enough to bring one into
existence. Threads are not required for a day to be real.

**Week** is the weekly goals list and the planner's settings. A goal is one line and a checkbox;
click it and it opens a freeform box for steps, links, constraints — anything worth telling the
planner. However much you write, the collapsed row stays one line, because a weekly list that
cannot be read at a glance stops being read. Nothing carries forward on its own: rolling an
unfinished goal into next week is a button you press, per goal.

**The week planner** turns those goals plus your open threads, to-dos and blockers into ordered
days, using [Claude](https://claude.com). One press plans **every day the week has left** — seven
on a Monday, three on a Friday — and the button says which, because that difference is the whole
shape of the offer. The week's summary sits on **Week**; each day's blocks appear at the top of
**Daily**, where the day is.

A block that names a real thread gets a **Start** button wired to the actual session engine, so
following the plan and using the timer are one action rather than two. A block that describes work
with no thread behind it yet gets **+ Thread**, which puts it on the board and gives it a timer
without leaving the day. What the planner decided *not* to fit is printed underneath — a plan you
cannot argue with is one you stop reading.

Generation happens on the server, not here, so the plan arrives on your phone without anyone
pressing anything there. See [Week planner](#week-planner).

**Calendar** is where you find out whether the week you generated survived the week you had. See
[Calendar](#calendar).

**Dashboard** keeps the momentum system — a rolling score that dents rather than resets — and
adds plain counts: steps completed, average and longest block, when you actually start work, and
all-time totals.

**The HUD** is a small frameless always-on-top window running a 25/5 cycle with manual advance.
When a stage ends the timer parks on the next one, glows and chimes, and waits for Resume.
**Park** logs a distraction, writes it to today's Park list, and adds two minutes back.

## Week planner

The planner is the only part of this app that reaches a paid API, and as of the move to the
server it is the only part that does not hold the key.

### It runs on the server now

It used to run here, against a key on this machine. It moved for one reason that is not
negotiable and one that is merely obvious: **the phone cannot hold an API key safely at all**,
and three clients each holding their own key means three keys to rotate, three copies of the
prompt to keep in step, and a bill nobody can total.

What is left in this app is a button and a renderer. `PlannerService` asks the server to start a
run and polls until it finishes; the plan arrives through the ordinary sync path, which is also
why pressing the button on the phone puts the same week on this screen.

The prompt, the caps, the id validation and the pricing table all live in the backend repo now,
under `src/planner/`. There is no `ApiKeyStore` here any more and no IPC channel that carries a
key in either direction — this app has never seen one.

**Planning needs you signed in**, because the account is what identifies whose goals to read.
The button says so rather than failing when pressed. If the server has no key configured,
`/auth/me` reports `plannerAvailable: false` and the button says that instead.

### It costs money, and a Claude Pro subscription does not cover it

The [Claude API](https://console.anthropic.com) bills separately from a Claude Pro or Max
subscription — different product, different billing, no overlap. Credits are bought in the
console; there is no way to point an app at a chat subscription.

The amounts are small, and now it is one run a week rather than one a day:

| Model | Per week | Weekly |
| --- | --- | --- |
| Claude Opus 5 *(default)* | ~$0.12 | ~$0.50/month |
| Claude Sonnet 5 | ~$0.07 | ~$0.30/month |
| Claude Haiku 4.5 | ~$0.03 | ~$0.10/month |

Measured, not estimated: a real five-day generation with two goals, a thread, two to-dos and a
blocker costs 2,956 input and 4,284 output tokens, and takes about a minute.

Switch models on the **Week** tab. Opus 5 is the default because the hard part is judgement —
weighing a vague goal against nine competing items, and being honest about what will not fit in
the days that are left — and that is where the tiers differ most.

### Keeping the bill down

- **Nothing is automatic.** One button, guarded against re-entry here *and* on the server, which
  is the only guard that holds when the phone presses it at the same moment.
- **The context is capped, not trimmed by eye.** Goal context, to-do count, thread count and
  lookback are all bounded, so a goal with an essay pasted into it cannot turn a twelve-cent call
  into a two-dollar one.
- **A compact digest, not JSON.** Labelled lines cost meaningfully fewer tokens than
  pretty-printed JSON for the same facts.
- **No prompt caching, on purpose.** The prefix is well under the ~1024-token minimum and a week
  is planned about once a week, so every cache read would miss the window — caching would add the
  1.25× write premium and never earn it back.
- **Spend is shown, summed from the runs themselves** rather than a counter that can drift, and
  per *run* rather than per day: one press produces up to seven days from one call, so counting
  per day would report the bill several times over.

### Nothing the model returns is trusted

Server-side, the reply is parsed against a schema and every `threadId` / `todoId` / `goalId` is
checked against a real record — a hallucinated id becomes an absent one, so the block loses its
Start button rather than gaining one that starts nothing. Days outside the planned window are
discarded, overlapping and out-of-range blocks are corrected, and `model` and `usage` are stamped
by the server, because asking a model to report its own token spend is not a measurement.

### Regenerating cannot orphan work you started — or erase your edits

Plans are disposable: press the button again and every suggestion is replaced. With two
exceptions.

Turn a block into a thread with **+ Thread** and it stops being a suggestion — it points at a
real thread with real time logged against it. `linkBlock` stamps `promoted: true` alongside the
thread id, and the server carries promoted blocks across a regeneration untouched, dropping any
freshly generated block that would sit on top of one. A day the model skips entirely is kept
rather than thrown away if it holds one.

The second exception is yours by hand. Plans stopped being read-only: every block has an Edit
affordance — title, times, kind, or move it to another day — plus Delete, and a plan grows an
"+ Add a block" of its own (including on a day that was never planned). Every hand edit stamps
the block `pinned: true`, which carries the same contract as `promoted`: the model proposes,
and anything you touch is yours. The old "a half-edited plan is a document nobody trusts" rule
existed because edits did not survive regeneration; now they do, so it retired.

See `src/main/services/PlannerService.ts` here, and `src/planner/` in the backend repo.

### The standing context reaches the planner

"Anything the planner should always know" — the **Context — always true** box on the Week tab —
rides the profile push as part of the planner settings slice, alongside the wake/work/done
times, the model and the effort. The server merges these keys into the profile blob key by key
and builds every plan from them, whichever device pressed the button. (For a while the box
wrote `settings.json` and stopped there; the server planned every week with an empty context.)

## The day, run live

**Start my day** turns the plan from a document into a runtime. A day run is to the day what a
session is to a block: an explicit start, a live pointer, a clean end. The Daily page highlights
the block whose window contains the clock (NOW), says "block 3 of 9", and keeps four mending
verbs one click away, ordered by cost:

- **+15m / +30m** — running late. Slides everything still ahead; the finished morning stays
  put. The shift is anchored (`shiftFrom`) so the same records render the same way on every
  device — the arithmetic lives in `src/shared/dayRun.ts`, the third pure module ported across
  the repos with its tests, after week keys and the calendar projection.
- **Skip** — let the current block go. It stays visible, struck through, labelled "let go".
  Never "missed": a decision is not a failure.
- **Replan rest** — life happened. One call to `POST /plan/day` reshapes only the hours still
  ahead; what happened and what is pinned stays exactly where it was.
- **End day** — close it out.

Rows show the *effective* times while a run is live: a day shifted +30 reads as the day being
lived, not the one that fell behind. Nothing auto-starts — the run points, you ignite — and the
run record syncs, so the phone's lock screen and this window agree about what "now" means.

### Nudges

`NowService` watches today's plan and announces each block as its start crosses the clock: the
HUD pops with the block's name, and the OS notification's click lands on the Daily page next to
the block's own Start button. Quiet on purpose while a session runs — the answer to "what
should I be doing" is: what you are doing — and a laptop waking from sleep only announces the
last few minutes, never the whole morning it slept through. Nudges fire at the shifted times
and never for a skipped block. The toggle lives with the planner settings, per machine.

## Calendar

Three scopes, and they answer three different questions rather than being three zoom levels of
one. **Month** is *pattern* — where the good weeks were. **Week** is *shape* — did the plan
survive contact. **Day** is *sequence* — what now, and did the last thing happen.

### Two lanes

The week grid splits every day: the plan on the left, what actually happened on the right.

A single merged column can only tell you what is on Tuesday. Two lanes answer the question you
actually have after generating a week — a day where the right lane mirrors the left went to plan,
a day with a full left lane and an empty right one did not, and a day with an empty left lane and
a busy right one is work nobody planned, which is usually the most informative square on screen.

A plan is drawn as an **outline** — a shape you were going to fill. A session is **solid**,
because it happened. So a good week is a screen of filled shapes and a scattered one is a screen
of empty ones, legible before you read a single word.

Nothing here draws an unmet block as a failure: no red, no strike-through. A plan is a suggestion
that was true when it was made, and a calendar that scolds you on a bad week is one you stop
opening on bad weeks — which are the weeks it would have been most useful.

### It is honest about what happened

A block is **done because a real session touched its thread**, never because the clock has gone
past its end. A plan that marks itself complete as the afternoon arrives is a plan that lies, and
putting the plan and the day on one timeline is only worth doing if it doesn't.

Sessions are matched to blocks by thread first and clock second. Thread first, so a block you
finally got to after dinner counts rather than reading as ignored. Clock second, because a thread
commonly appears twice in a day — crediting both blocks with every minute spent on it would
report two hours of work for one.

### The floating calendar

**Float** (or the tray) pops the calendar into a small always-on-top window, the same three views
at a smaller size. It exists because the alternative to *glancing* at a calendar is *opening* one,
and alt-tabbing to another window to check what was next is the exact moment the thread gets
dropped.

It is deliberately not interactive beyond changing what it shows — nothing to start, tick or edit.
A widget you can work in stops being a glance and becomes a second app.

Unlike the HUD it floats above normal windows but not above full-screen ones: a timer you cannot
lose is worth interrupting a presentation for, and a calendar is not.

### Where the data comes from

From the backend's `GET /calendar`, which composes the projection once so the laptop and the phone
cannot disagree about the same Tuesday — **and** from local files, which is what actually paints.

The order matters and is not interchangeable. `calendar:get` builds the week from disk and always
answers; `calendar:refresh` asks the server and swaps its answer in only if one arrives. Fetching
first and falling back on failure would make every calendar paint wait on a timeout the moment the
wifi is captive-portalled, which is precisely the case the local-first design exists for. Signed
out, the local build is the whole answer — the app works signed out, and so does the calendar.

The projection itself lives in `src/shared/calendar.ts`, ported rule for rule from the backend's
`src/calendar.ts` with its tests, the same way `week.ts` was.

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

The week planner needs a server with a key. In development the quickest route is a gitignored
`.env` at the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

You can also paste one into the **Week** tab, which is the only route that survives packaging —
see [Day planner](#day-planner).

## Accounts

There is an account, and it is optional. Everything works signed out; signing in is what will
let the same threads and days appear in [`adhd-mobileapp`](../adhd-mobileapp). It is reached
from the bottom of the side rail, never from a launch screen — an app that opens onto a sign-in
form is an app that failed on the day you had no signal.

### Is the server up?

A **Check** button at the bottom of the account page, with a light and a sentence. It answers
signed out too — being signed out is not the same as being offline, and the person most likely to
be asking is the one who cannot sign in.

It checks when pressed and at no other time. A light that polled would be a background request
every few seconds for a question nobody asked, and it would go red on a train to tell someone
whose work is already safely on this Mac that something is broken.

**A green light means the host answered — not that a sync would succeed.** `/health` is a liveness
probe and touches no database, so the wording stays inside what it can show: it says the host
answered and how fast, never that anything is "working". That is the useful question anyway, since
this exists to separate "my wifi is down" from "the server is down". The failure text ends with
*Nothing here depends on it*, which is the truth worth repeating: every write landed on this Mac
before the server heard of it.

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

### Sync

Pull first, then push. Pulling first means last-write-wins compares against records this machine
has actually seen, so a push cannot clobber an edit made on the phone that the laptop had not
heard about yet.

- **Every local write marks itself.** `JsonStore` calls `onWrite` on the one code path a record
  can change, so "nothing is edited without sync finding out" is true by construction rather than
  by remembering to call something in twelve repository methods. The queue is keys, not copies —
  a second copy of a record is a second thing to keep in step — and it lives in `sync.json` so
  quitting mid-edit does not lose it.
- **Deletes leave tombstones.** A record that simply stops existing looks identical to one the
  server has never seen, so it comes back on the next sync. `ThreadRepo.remove` writes
  `deletedAt` and every read path filters it out.
- **A conflict is not a prompt.** The server had something newer; the local copy is overwritten
  and dropped from the queue. Retrying would push the same stale record forever.
- **Nothing blocks.** A write lands in local JSON and returns; sync runs afterwards on a 5s
  debounce, on window focus, when a session ends, when you sign in, and every five minutes as a
  net. Offline is a status line, not an error.
- **The push is held while a timer runs.** Sessions tick every second; the session goes up once,
  when it ends. Pulling carries on.

Sits (`MindfulSession`) are recorded on the phone and only ever received here — the sync engine
is their sole writer, and they are kept out of `sessions` because momentum is computed from that
collection and a sit is practice, not focus work.

The default host is `api.adhd.yatishgautam.com`, which is the same one the iOS app uses. Note
that `adhd-webapp/API.md` documents `api.yatishgautam.com`, which does not resolve.

## Test

```bash
npm test
```

139 unit and integration tests covering the storage engine (kill-mid-write, unreadable files,
migration from the old sharded layout), goals and plans round-tripped through a real `Database`,
the ISO week maths across year boundaries, the momentum/insight math, celebration pack selection,
the 25/5 stage cycle, sparse step ordering, and Notion link classification.

The sync integration suite runs against a real backend and covers the round trip in both
directions for goals, and inbound for plans — including that a plan the server wrote is not
queued straight back at it, and that `promoted` survives the trip.

Nothing in the suite calls the Claude API — the planner's network boundary is the one seam left
to a manual check, and a test that spends money on every run is a test people disable.

Five more talk to a real backend and **skip themselves when none is reachable**, so the suite
still passes on a laptop with nothing running — they are the only proof that this client and
that server agree, rather than that this client agrees with a fixture it wrote itself:

```bash
ADHD_TEST_API=http://localhost:8099 npm test
```

Those cover a laptop and a phone on one account: a thread written here reaching the server, a sit
recorded on the phone landing on this disk, a delete staying deleted, and the newer of two edits
winning. The second device is raw HTTP rather than a mock, because a mock agrees with whatever I
believed when I wrote it.

Registration is rate limited to five per hour and those tests spend two, so a tight loop of
reruns starts seeing 429s. Restart the API; the limiter counts in memory.

## Build

```bash
npm run build       # typecheck + electron-vite build
npm run pack:mac    # a runnable .app in dist/
npm run dist:mac    # packaged .dmg / .zip via electron-builder
npm run install:mac # pack, then replace /Applications/ADHD Superpower.app
```

### Installing over yourself

`install:mac` exists because this app stays resident. Closing its window does not quit it, so
copying a new build over the old one leaves a process whose code no longer matches the files
underneath it — which then crashes in ways that look like bugs in the app.

The script stops it with **Quit**, not a kill, and the difference matters: quitting runs the
app's own shutdown, which ends a focus block in progress as `ended_early` and flushes the JSON
store. It escalates to `TERM` and then `KILL` only if Quit is ignored, and says so when it does,
because a killed app loses whatever had not reached the write debounce and leaves an open
session behind for the recovery prompt to find.

It does not relaunch unless you ask:

```bash
npm run install:mac -- --launch
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
    storage/         JsonStore: atomic writes, reload/repair, migration, repositories
    services/        SessionService (monotonic clock), StageController (the 25/5 cycle),
                      AnalyticsService (momentum/rollups), CelebrationOrchestrator,
                      PlannerService (asks the server to plan, then polls),
                      momentum math, insight cards, link opening, login item
    windows/          main window, HUD, celebration overlay (one per display), tray
    ipc/              every IPC handler, keyed by channel name
  preload/            contextBridge, typed API surface
  renderer/
    main-window/       Threads / Daily / Week / Dashboard tabs, Park view, Zustand stores
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
- **report, never delete** — a file that fails to parse, or a record that fails validation, is
  skipped and surfaced as a banner while the rest loads. Nothing is moved or rewritten: the data
  is the user's, and leaving the bad file exactly where it is keeps the bug reportable
- **pretty-printed, sorted keys** — the export stays diffable and git-friendly
- **sparse ordering** (1000, 2000, 3000) for steps, todos and the board, so a drag-reorder writes
  one record's `order` field rather than the whole list

Collections are `threads.json`, plus `days/`, `sessions/` and `mindful/` split by month,
`goals/` and `weekPlans/` split by ISO week-numbering year, and `plans/` split by month. All of
them sync.

Goals and plans are not symmetrical, and the asymmetry is the point. Goals are written here and
pushed like anything else. Plans are written by the *server* and only pulled — a generation
writes them through the untracked path, because queueing a record that came from the server sends
it straight back and burns a round trip settling a conflict with ourselves. The single exception
is a tombstone: throwing a plan away is a local decision and has to travel.

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

Weekly goals and the week planner are verified at the layers that can be tested without a GUI:
139 passing tests including the ISO week maths across year boundaries, a storage integration
suite that round-trips goals and plans through the real `Database` (schema validation on reload,
partitioning, tombstones), and a sync integration suite against a running backend covering goals
in both directions and plans inbound.

The guard that used to assert goals and plans could never enter the push queue has been replaced
by its inverse, deliberately rather than deleted: it was a tripwire for the day the server grew
columns for them, and that day came.

The Claude request shape — adaptive thinking, `output_config.effort`, and structured output via
`zodOutputFormat` — now lives in the backend repo and is exercised there.

The planner's UI has **not** been driven in a running window: this machine denies Screen
Recording and its Electron build does not answer on the remote-debugging port, so neither a
screenshot nor a CDP session was possible. The app was confirmed to boot cleanly with these
changes — both renderers up, no console output, idle CPU — but the Week tab and the plan panel
have not been looked at by a human or a driver. That is the one gap worth closing first.

Deferred to a later pass: the settings screen, data export/repair UI, keyboard shortcuts, and a
full sound design pass. The underlying IPC handlers for repair/export already exist
(`data:repair`, `data:export`) — only the UI is missing. Session length is therefore still fixed
at 25 minutes unless `settings.json` is edited by hand, even though the dashboard computes and
displays a suggested length.

### Known trade-offs

- **A new field still costs edits in several files.** Domain type, Zod schema, collection spec,
  repository, IPC channel map, handler, renderer store. That is the price of the type-checked
  seam between the three processes, and it caught real mistakes while the planner was being
  built — but it is why a small feature is never a small diff here.
- **Everything is held in memory.** `JsonStore` reads every file at boot and writes them back
  whole. Correct and fast at a personal dataset's scale, and the thing to revisit first if these
  files ever reach tens of megabytes.
- **Goals and plans do not sync.** They are desktop-only until the backend grows tables for
  them, which means the phone cannot see this week's goals yet. The records are already shaped
  for it — `updatedAt`, tombstones, stable ids — so the work is a wire mapping and an endpoint,
  not a migration.
- **A plan is a snapshot, not a live document.** Complete a thread after generating and the plan
  still lists it; the block simply loses its Start button. Regenerating is a fresh call, so the
  honest options are to re-plan or ignore the stale line, and re-planning costs another nickel.
- **The generation is a 25-second modal wait.** Fine for something you do once a morning, but it
  is the slowest interaction in the app by an order of magnitude. Streaming the blocks in as they
  arrive would fix it and is not built.
- **`out/` and the `.tsbuildinfo` files are tracked in git.** Build output in version control
  makes every diff enormous. Worth gitignoring, but doing so means committing a build that
  references asset filenames no longer present.
