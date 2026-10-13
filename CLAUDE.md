# Formation Planner: conventions

Local-first web app for planning dance formations against a reference video with synced audio.
No tempo/BPM/8-count features (explicitly out of scope) and no dancer photos.

## Commands
- `npm run dev`: Vite dev server
- `npm test`: Vitest (unit tests in `src/core`, `src/store`, plus a jsdom shell test in `src/App.test.tsx`)
- `npm run typecheck`: `tsc -b`
- `npm run build`: typecheck + production build
- `npm run lint`: oxlint

## Architecture rules
- **`src/core` is pure TypeScript**: no React, DOM or store imports. All logic that matters
  (interpolation, snapping, collision, arrangement, swap, instructions) lives here and is unit-tested.
- **Time is milliseconds** on the media timeline (`Ms`). Formations store `timeMs`.
- **Project data is JSON-serializable** and versioned (`schemaVersion`). Add a migration in
  `core/schema.ts` when the shape changes; never edit old versions in place.
- **Project vs UI state**: `store/projectStore` holds the undoable project; `store/uiStore` holds
  selection, panels, theme (not undoable).
- **All project edits go through `useProjectStore.edit(label, recipe, { coalesceKey })`**. It records
  Immer patches for undo/redo. Use a `coalesceKey` for continuous gestures (drags, typing) so they
  merge into one undo step.
- **Playhead is not React state**: use `store/playheadStore` and subscribe imperatively so playback
  doesn't re-render the tree. Konva nodes are updated via refs during playback.
- Media blobs (video) go in IndexedDB keyed by hash; the project stores only a `MediaRef`.
- **The project is the source of truth for the loaded video.** Change `project.media.video` (via
  `loadVideoFile` / `removeVideo` / undo) and `media/mediaSync` makes the player follow. Never set the
  player's source directly.
- **All playback goes through `media/transport`** (`play`, `seek`, `step`, `setLoop`...). The `<video>`
  element is the master clock when a video is loaded (so audio is always in sync); otherwise an
  animation-frame clock drives the playhead. Per-frame UI (time readout, seek bar, timeline playhead)
  subscribes to `playhead` imperatively; low-frequency state (playing, rate, loop, peaks) is in
  `playbackStore`.
- Pastel theme tokens live in `index.css` (`--accent` is a fill, `--accent-strong` is for focus/selection).
  Dancer fill colors are pastel, so use `readableInk()` for text on them.
- `erasableSyntaxOnly` is on: no enums or constructor parameter properties.
- Icon-only buttons must pass `label` (becomes `aria-label` and tooltip). Never rely on color alone:
  dancers always show their number.

## Layout
`src/core` model/logic, `src/store` state, `src/features/*` panels, `src/app` shell, `src/ui`
shared primitives/shortcuts, `src/samples` demo project. Path alias `@` = `src`.

## Formations & editing model
- Stage coords: origin at center, +x = audience's right, +y = toward the audience (downstage). `facing` is degrees clockwise from above, 0 = toward the audience. The audience side only rotates the *view* (`core/stage.ts` `toView`/`fromView`).
- Editing a dancer at time t is **auto-keyframed** (`projectStore.setPoses` → `ensureFormationAt`): within 50 ms of a formation it edits that formation, otherwise it creates one at t from the interpolated pose. Formations stay ≥100 ms apart; the last formation can't be deleted.
- A formation is in place at `timeMs` and held for `holdMs`; the move to the next formation takes the rest of the gap.
  Always read the hold with `effectiveHold(formations, i)` (it is cut short if the next formation starts sooner).
  `holdMs: 0` means the dancers start moving straight away. Splitting a hold (auto-keyframe inside it) hands the rest
  of the hold to the new formation so motion never changes. `setFormationHold` clamps to the next formation unless
  given a `rippleGapMs`, which shifts all later formations instead.
- A formation `label` of `''` means "unnamed"; display it with `formationName(f, index)` ("Formation N").
- Interpolated `present` is from||to; UI code treats `opacity >= 0.5` as "on stage".

## Center time
- `core/centerTime.ts`: the "center" at time t is the on-stage dancer within the center zone (|x| ≤ width/2) closest
  to the center line, then nearest the audience; dancers still level share it. `centerTimes` samples every 100 ms. The right panel's "Center time" tab
  (`features/center`) shows it; the zone width is a UI setting (`uiStore.centerZoneWidth`, default = 2 × `minDistance`).

## Video export
- `features/export`: `drawFrame.ts` draws a frame (stage, title strip, reference video in a corner) on a plain 2D
  canvas using the same `core` interpolation as the stage; `exportVideo.ts` records that canvas in real time with
  `MediaRecorder` (its own hidden `<video>` supplies picture and sound, so `media/transport` is not involved). Frames
  are driven by a worker timer, not `requestAnimationFrame`, so a background tab doesn't stall the export.
  Keep `drawStage` visually in line with `features/stage` (Floor/DancerMarker) when those change.

## Persistence
- `persistence/autosave.ts` debounces saves (500 ms) to Dexie (`projects` table), flushes on tab hide/close and Ctrl/⌘+S, and exposes real `dirty`/`saveError` state for the top bar. Never show "Saved" unless `markSaved` ran.
- `persistence/actions.ts` opens the last project on boot, and handles new/open/delete and saving to / opening from files.
- **Files on disk** (`persistence/fileLink.ts`): a project can be linked to a real file (File System Access API,
  Chromium only). Every `flushSave` then also rewrites that file. The handle is remembered per project in the Dexie
  `fileHandles` table; after a reload the browser may want permission again, which can only be requested from a user
  gesture (`writeLinkedFile(p, true)`, e.g. the Save button or Ctrl/⌘+S). Never show "Saved to <file>" unless a write
  succeeded (`useFileLinkStore.status === 'saved'`). Browsers without the API download a copy instead.
- Opening a file keeps its project id unless a *different* project is stored under that id (then it opens as a copy).
- Team size is capped at `MAX_DANCERS` (40); `DANCER_COLORS` has 30 distinct fills.

## Testing
- `npm test` uses `fake-indexeddb` (`src/test-setup.ts`); `App.test.tsx` mocks `react-konva` (jsdom has no canvas).
- A real Chromium is preinstalled at `/opt/pw-browsers/chromium` (use `playwright-core` with `executablePath` and `--no-sandbox`; don't run `playwright install`). In dev builds `window.__fp.dancerPos(id)` / `.ppu()` exposes stage positions for browser tests.
