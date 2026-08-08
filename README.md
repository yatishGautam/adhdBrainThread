# Thread

A desktop focus companion for ADHD working sessions. Electron + React + TypeScript.
Local-first, file-backed, no server, no account.

This project began as FocusBar, a simple Pomodoro timer (kept for reference in `legacy/`), and
was rebuilt into Thread following the full product spec: a threads board instead of a task list,
a floating always-on-top HUD, a momentum system that replaces streaks, and a celebration overlay
— all backed by a hand-rolled sharded JSON storage engine instead of a database.

## Design principles

- **One thing is on screen at a time.** The board is an inventory; the HUD is the product.
- **Starting is the behaviour being reinforced, not finishing.** A 4-minute abandoned session
  still counts toward momentum.
- **Nothing accumulates as debt.** No streak that can break. No overdue counters.
- **Blocked is not failure.** `waiting` is a calm status, not a warning.
- **Logging a distraction costs zero points and adds time back to the clock** — the moment
  self-reporting feels expensive, people stop doing it.
- **The data is the user's.** Plain JSON, pretty-printed, sorted keys, git-friendly.

## Run it

```bash
npm install
npm run dev
```

`electron-vite dev` starts all three renderers (main window, HUD, celebration overlay) with HMR.

## Test

```bash
npm test
```

Unit tests cover the storage engine (kill-mid-write, backdated inserts into sealed shards,
corrupt-shard quarantine, manifest rebuild from disk, journal replay) and the momentum/insight
math.

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
  shared/            domain model, IPC contract, constants, formatting — imported by all three processes
  main/
    storage/         ShardedStore: manifest, journal, atomic writes, repair/quarantine, repositories
    services/        SessionService (monotonic clock), AnalyticsService (momentum/rollups),
                      CelebrationOrchestrator, momentum math, insight cards
    windows/          main window, HUD, celebration overlay, tray
    ipc/              every IPC handler, keyed by channel name
  preload/            contextBridge, typed API surface
  renderer/
    main-window/       Today / Threads / Analytics tabs, Zustand stores
    hud/                floating timer window
    celebration/        overlay + pack registry (one file to touch when adding a pack)
```

### Storage

Size-based sharding with a manifest index and lazy loading, hardened with a write-ahead journal:

- shard files are always written before the manifest; the manifest is a rebuildable cache
- every mutation is journaled (fsynced) before it's considered accepted — a crash between the
  journal write and the shard flush is recovered by replaying the journal on boot
- a shard that fails to parse or validate is quarantined (renamed aside), never deleted
- `threads/active.json` is the one unsharded collection — bounded by the work-in-progress cap
- steps and todos use sparse integer ordering (1000, 2000, 3000) so a drag-reorder writes one
  record's `order` field, not the whole list

See `src/main/storage/ShardedStore.ts` and its test suite for the full failure-mode matrix.

## Status

Phases 1–6 of the build spec are implemented and manually verified end-to-end (storage → IPC →
main window → HUD → celebration overlay, zero console exceptions): the storage engine, threads
board, HUD + sessions, Today view, celebrations, and analytics.

Deferred to a later pass: the settings screen, data export/repair UI, keyboard shortcuts, and a
full sound design pass. The underlying IPC handlers for repair/export already exist
(`data:repair`, `data:export`) — only the UI is missing.
