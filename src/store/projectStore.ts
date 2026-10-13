import type { Draft } from 'immer'
import { create } from 'zustand'
import { layout } from '@/core/arrange'
import {
  addDancerToProject,
  addFormationAt,
  applyDancerStates,
  deleteFormation as deleteFormationOp,
  duplicateFormation as duplicateFormationOp,
  ensureFormationAt,
  formationIndexAt,
  setFormationHold as setFormationHoldOp,
  setFormationTime as setFormationTimeOp,
} from '@/core/formations'
import {
  DANCER_COLORS,
  MAX_DANCERS,
  createProject,
  newId,
  type Dancer,
  type DancerId,
  type DancerState,
  type EasingName,
  type FormationId,
  type Ms,
  type Project,
} from '@/core/model'
import { defaultSpacing } from '@/core/arrange'
import {
  applyEdit,
  createHistory,
  redo as redoHistory,
  undo as undoHistory,
  type ApplyOptions,
  type HistoryState,
} from './history'

interface ProjectStoreState {
  history: HistoryState<Project>
  /** True while there are changes that haven't reached IndexedDB yet. */
  dirty: boolean
  /** Set when autosave fails (storage full or blocked); cleared by the next successful save. */
  saveError: string | null
  /** Replace the whole project (open/import/new). Clears undo history. */
  loadProject: (p: Project) => void
  /** Run an undoable edit. */
  edit: (label: string, recipe: (draft: Draft<Project>) => void, opts?: ApplyOptions) => void
  undo: () => void
  redo: () => void
  /** Mark the given snapshot as saved; ignored if the project changed again while saving. */
  markSaved: (saved: Project) => void
  setSaveError: (message: string | null) => void

  setName: (name: string) => void
  /** Add one dancer. Returns undefined when the team is already at `MAX_DANCERS`. */
  addDancer: () => DancerId | undefined
  /** Add several dancers at once (up to `MAX_DANCERS` in total), neatly arranged. */
  addDancers: (count: number) => void
  updateDancer: (id: DancerId, patch: Partial<Omit<Dancer, 'id'>>) => void
  removeDancer: (id: DancerId) => void

  /** Add a formation at time t, or duplicate it if one is already there. Returns its id. */
  addFormationAtTime: (t: Ms) => FormationId
  duplicateFormation: (id: FormationId) => FormationId | undefined
  deleteFormation: (id: FormationId) => void
  setFormationTime: (id: FormationId, t: Ms) => void
  /**
   * Set how long a formation is held before the dancers move on. With `rippleGapMs`, later
   * formations are moved along so the next one starts that long after the hold ends.
   */
  setFormationHold: (id: FormationId, holdMs: Ms, rippleGapMs?: Ms) => void
  updateFormation: (id: FormationId, patch: { label?: string; notes?: string }) => void
  setTransitionEasing: (fromId: FormationId, easing: EasingName) => void
  /** Pose edit at time t. Creates a formation at t if there isn't one there. */
  setPoses: (
    t: Ms,
    patches: Record<DancerId, Partial<DancerState>>,
    label: string,
    opts?: ApplyOptions,
  ) => void
  replaceProject: (p: Project) => void
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  history: createHistory(createProject()),
  dirty: false,
  saveError: null,

  loadProject: (p) => set({ history: createHistory(p), dirty: false }),
  replaceProject: (p) => get().loadProject(p),

  edit: (label, recipe, opts) => {
    const next = applyEdit(
      get().history,
      label,
      (d) => {
        recipe(d)
      },
      opts,
    )
    if (next === get().history) return
    set({ history: next, dirty: true })
  },

  undo: () => set((s) => ({ history: undoHistory(s.history), dirty: true })),
  redo: () => set((s) => ({ history: redoHistory(s.history), dirty: true })),
  markSaved: (saved) =>
    set((s) => (s.history.present === saved ? { dirty: false, saveError: null } : { saveError: null })),
  setSaveError: (saveError) => set({ saveError }),

  setName: (name) =>
    get().edit('Rename project', (d) => void (d.name = name), { coalesceKey: 'rename' }),

  addDancer: () => {
    if (get().history.present.dancers.length >= MAX_DANCERS) return undefined
    const id = newId('dancer')
    get().edit('Add dancer', (d) => {
      const used = new Set(d.dancers.map((x) => x.number))
      let number = 1
      while (used.has(number)) number++
      addDancerToProject(d, {
        id,
        name: `Dancer ${number}`,
        number,
        color: DANCER_COLORS[(number - 1) % DANCER_COLORS.length],
      })
    })
    return id
  },

  addDancers: (count) => {
    const room = MAX_DANCERS - get().history.present.dancers.length
    const n = Math.max(0, Math.min(room, Math.floor(count)))
    if (!n) return
    get().edit('Add dancers', (d) => {
      const used = new Set(d.dancers.map((x) => x.number))
      const fresh: Dancer[] = []
      let number = 1
      for (let i = 0; i < n; i++) {
        while (used.has(number)) number++
        used.add(number)
        fresh.push({
          id: newId('dancer'),
          name: `Dancer ${number}`,
          number,
          color: DANCER_COLORS[(number - 1) % DANCER_COLORS.length],
        })
      }
      // A brand-new team gets a tidy block; later additions find free spots around the others.
      if (d.dancers.length === 0) {
        const { slots } = layout('block', n, defaultSpacing(d.settings.minDistance) + 1)
        fresh.forEach((dancer, i) => addDancerToProject(d, dancer, slots[i]))
      } else {
        fresh.forEach((dancer) => addDancerToProject(d, dancer))
      }
    })
  },

  updateDancer: (id, patch) =>
    get().edit(
      'Edit dancer',
      (d) => {
        const dancer = d.dancers.find((x) => x.id === id)
        if (dancer) Object.assign(dancer, patch)
      },
      { coalesceKey: `dancer:${id}` },
    ),

  removeDancer: (id) =>
    get().edit('Remove dancer', (d) => {
      d.dancers = d.dancers.filter((x) => x.id !== id)
      for (const f of d.formations) delete f.positions[id]
      for (const t of d.transitions) delete t.perDancer[id]
    }),

  addFormationAtTime: (t) => {
    const id = newId('form')
    let used = id
    get().edit('Add formation', (d) => {
      const i = formationIndexAt(d.formations, t)
      if (i >= 0) {
        used = duplicateFormationOp(d, d.formations[i].id, id) ?? id
      } else {
        used = addFormationAt(d, t, id)
      }
    })
    return used
  },

  duplicateFormation: (fid) => {
    const id = newId('form')
    let result: FormationId | undefined
    get().edit('Duplicate formation', (d) => {
      result = duplicateFormationOp(d, fid, id)
    })
    return result
  },

  deleteFormation: (id) => get().edit('Delete formation', (d) => void deleteFormationOp(d, id)),

  setFormationTime: (id, t) =>
    get().edit('Move formation', (d) => void setFormationTimeOp(d, id, t), { coalesceKey: `retime:${id}` }),

  setFormationHold: (id, holdMs, rippleGapMs) =>
    get().edit('Change formation length', (d) => void setFormationHoldOp(d, id, holdMs, rippleGapMs), {
      coalesceKey: `hold:${id}`,
    }),

  updateFormation: (id, patch) =>
    get().edit(
      'Edit formation',
      (d) => {
        const f = d.formations.find((x) => x.id === id)
        if (f) Object.assign(f, patch)
      },
      { coalesceKey: `formation:${id}` },
    ),

  setTransitionEasing: (fromId, easing) =>
    get().edit('Change easing', (d) => {
      const tr = d.transitions.find((x) => x.fromFormationId === fromId)
      if (tr) tr.easing = easing
      else d.transitions.push({ fromFormationId: fromId, easing, perDancer: {} })
    }),

  setPoses: (t, patches, label, opts) =>
    get().edit(
      label,
      (d) => {
        const fid = ensureFormationAt(d, t)
        applyDancerStates(d, fid, patches)
      },
      opts,
    ),
}))

export const selectProject = (s: ProjectStoreState): Project => s.history.present
export const selectCanUndo = (s: ProjectStoreState): boolean => s.history.past.length > 0
export const selectCanRedo = (s: ProjectStoreState): boolean => s.history.future.length > 0
