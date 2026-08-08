# Thread — v2 plan

v1 covers PRD phases 1–6 plus a clarity pass on the UI. Everything below was deliberately cut
to get a usable app first. Ordered by what actually blocks daily use.

---

## 1. Settings screen (highest value — currently unreachable)

Every setting already exists in `Settings` (`src/shared/domain.ts`) and is persisted; there is
just no UI. Build `features/settings/SettingsView.tsx` as a fourth tab:

- **Session length** — slider, 5–90 min. Surface the median-to-first-distraction suggestion from
  `ScopeSummary.distractions.suggestedSessionMs` next to it as a hint, never as a default.
- **Distraction grace** — 0–300s (`DISTRACTION_GRACE_MIN/MAX_MS`).
- **Sound / celebrations** — toggles for `soundEnabled`, `celebrationsEnabled`.
- **Data** — buttons wired to the handlers that already exist: `data:repair`, `data:export`,
  `data:reveal`. Show the `RepairReport` result inline (shards scanned, quarantined files).
- **Timezone** — read-only display of the detected zone, with a note that it is stamped onto
  records at write time and changing it does not rewrite history.

## 2. Sound design pass

`micro:tick` already broadcasts with a rotating `variant` (0–2) on every step and todo toggle;
nothing listens yet. Build `shared/lib/sound.ts` using WebAudio oscillators (no binary assets):

- three short tick variants, rotated so the highest-frequency reward in the app does not go numb
- a soft session-start and session-end tone
- one optional sting per celebration pack, gated on `settings.soundEnabled`

Tune ticks *before* celebration audio — a tick fires dozens of times a day and matters more.

## 3. Keyboard shortcuts

Nothing is bound today. Minimum set:

| Key | Action |
|---|---|
| `⌘1 / ⌘2 / ⌘3` | Today / Threads / Analytics |
| `⌘N` | New thread |
| `Space` | Pause/resume the running session (when not in an input) |
| `⌘D` | Log a distraction |
| `⌘.` | End session |
| `⌘\` | Collapse/expand the side rail |
| `Esc` | Close any picker/popover |

Register renderer-level via a `useHotkeys` hook; register `⌘D`/`⌘.` as global shortcuts in main
so they work while the HUD has focus.

## 4. Drag-to-reorder

The storage layer already supports it properly — `reorder()` in `stepOrder.ts` writes a single
record's sparse `order` and only renumbers when a gap closes, and `steps:reorder` / `todo:reorder`
IPC channels are live. Only the drag interaction is missing. Use `@dnd-kit/sortable` in
`Checklist.tsx` and `TodoList.tsx`.

## 5. Empty-state and onboarding polish

`GettingStarted.tsx` covers the very first run. Still missing:

- a one-time HUD coach-mark the first time a session starts ("this stays on top — drag it
  anywhere")
- Analytics before there is any data: currently renders a valid but bleak all-zero page. Should
  say "come back after a few sessions" instead of drawing an empty chart.

## 6. Markdown rendering for notes

`Thread.notes` is documented as markdown and stored as such, but `ThreadDetail` renders it in a
plain `<textarea>`. Add a read/edit toggle with a small markdown renderer.

## 7. Testing gaps

Current: 44 unit tests, storage + momentum + celebration selection. Missing:

- **Playwright e2e smoke** — the PRD asks for it. Launch Electron, create a thread, run a
  session, complete it, assert the overlay appears and disappears within 6s. (The CDP scripts
  used to verify v1 by hand are the blueprint.)
- `AnalyticsService.rebuild()` vs incremental `touchDays()` equivalence — the PRD's acceptance
  criterion is "rollups match a full rebuild byte for byte", and that is currently unproven by
  a test.
- `SessionService` pause/resume/switch accounting with a mocked monotonic clock.
- DST-boundary test for `localDate` stamping.

## 8. Performance validation

PRD acceptance criteria not yet measured:

- 3 years of simulated data (~1000 days, ~4000 sessions) boots in <800ms, stays <150MB resident
- timer drift <1s over a 60-minute session
- idle memory <250MB (the PRD says revisit Electron vs Tauri above this)

Write `scripts/seed.ts` to generate the corpus — `package.json` already has a `seed` script
entry pointing at it.

---

## Known deviations from the PRD, for the record

- **HUD is 460px wide, not 360.** Control buttons carry text labels instead of bare glyphs;
  icon-only controls tested as the single most confusing part of the UI.
- **`Step` gained `completedLocalDate`.** The PRD's `Step` has only `completedAt`, but DMS
  buckets steps by local day, and re-deriving that from UTC at read time is exactly the DST bug
  §4.6 #11 warns about. Follows the same rule as every other record.
- **Shared code lives in `src/shared/`,** not `src/main/ipc/channels.ts`, so the renderer never
  imports from `src/main/`. Same single-source-of-truth guarantee, enforced by
  `CHANNELS_ARE_EXHAUSTIVE`.
- **`days/index.json`** — a small sorted list of dates that exist, so the day navigator doesn't
  need to load day shards to know what to render. Derived and rebuildable.
- **`ShardedStore.ts` is ~420 lines,** over the ~200-line guideline. It is one job (the storage
  engine) and splitting it further would scatter invariants that must be read together. The
  guideline held everywhere else.
- **Fonts fall back to system stacks.** Space Grotesk / IBM Plex are named first but not
  bundled; a packaged app can't fetch webfonts. Bundle the woff2 files in v2 if the type
  matters.
