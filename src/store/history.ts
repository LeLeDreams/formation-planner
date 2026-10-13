import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'

enablePatches()

export interface HistoryEntry {
  label: string
  patches: Patch[]
  inverse: Patch[]
  /** Edits with the same key within COALESCE_MS merge into one undo step (e.g. a drag). */
  key?: string
  at: number
}

export interface HistoryState<T> {
  present: T
  past: HistoryEntry[]
  future: HistoryEntry[]
}

export const COALESCE_MS = 800
export const MAX_HISTORY = 200

export const createHistory = <T>(present: T): HistoryState<T> => ({
  present,
  past: [],
  future: [],
})

export interface ApplyOptions {
  coalesceKey?: string
  now?: number
}

/** Apply an edit; returns the same state object when the recipe changed nothing. */
export function applyEdit<T>(
  h: HistoryState<T>,
  label: string,
  recipe: (draft: Draft<T>) => void,
  opts: ApplyOptions = {},
): HistoryState<T> {
  const [next, patches, inverse] = produceWithPatches(h.present, recipe)
  if (patches.length === 0) return h
  const now = opts.now ?? Date.now()
  const last = h.past[h.past.length - 1]
  let past: HistoryEntry[]
  if (
    opts.coalesceKey &&
    last &&
    last.key === opts.coalesceKey &&
    now - last.at <= COALESCE_MS &&
    h.future.length === 0
  ) {
    const merged: HistoryEntry = {
      label: last.label,
      key: last.key,
      at: now,
      patches: [...last.patches, ...patches],
      // Inverses run newest-first.
      inverse: [...inverse, ...last.inverse],
    }
    past = [...h.past.slice(0, -1), merged]
  } else {
    past = [...h.past, { label, patches, inverse, key: opts.coalesceKey, at: now }]
    if (past.length > MAX_HISTORY) past = past.slice(past.length - MAX_HISTORY)
  }
  return { present: next, past, future: [] }
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  const entry = h.past[h.past.length - 1]
  if (!entry) return h
  return {
    present: applyPatches(h.present as object, entry.inverse) as T,
    past: h.past.slice(0, -1),
    future: [entry, ...h.future],
  }
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  const entry = h.future[0]
  if (!entry) return h
  return {
    present: applyPatches(h.present as object, entry.patches) as T,
    past: [...h.past, { ...entry, key: undefined }],
    future: h.future.slice(1),
  }
}
