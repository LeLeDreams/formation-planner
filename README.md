# Formation Planner

A local-first web app for planning dance team formations: a stage canvas and a video-editor-style
timeline built around a reference video with synced audio.

> Status: working. Drag dancers into formation on the stage, keyframe them on the timeline against a
> reference video with synced audio, and everything autosaves in your browser (IndexedDB). Use **Save to file**
> (Ctrl/⌘ S) to also keep a project in a file on your computer; in Chrome and Edge that file then stays up to date
> as you work. Built for teams of up to 40 dancers.
> Try **Projects → Load sample routine** to see an 8-dancer example.

## Setup
```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + shell tests
npm run build
```

## Stack
React 19 + TypeScript + Vite, Tailwind CSS v4, Zustand + Immer (undo/redo via patches),
react-konva (stage), Dexie (IndexedDB persistence), Zod (import validation), Vitest.

## Architecture
- `src/core`: pure logic (data model, easing, interpolation, schema/migrations). No React or DOM.
- `src/store`: `projectStore` (undoable project), `uiStore` (selection, theme, panels),
  `playheadStore` (imperative clock), `history` (Immer-patch undo/redo with gesture coalescing).
- `src/media`: `transport` (playback controller; the `<video>` element is the master clock), `mediaSync`
  (keeps the active video in line with the project), `db` (Dexie blob storage), `audio` (waveform decode).
- `src/features/*`: roster, inspector, stage, video panels. `src/app/TimelinePanel` draws the ruler/waveform.
- `src/app`: top bar, workspace and timeline shell.

The data model is a `Project` with a stage config, dancers, formations (keyframes with positions
keyed by dancer id, at a `timeMs`), per-transition easing and per-dancer path overrides, and
sections. See `src/core/model.ts`. Files are validated and migrated on load (`src/core/schema.ts`).
