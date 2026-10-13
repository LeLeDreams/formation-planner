import { arrange, defaultSpacing } from './arrange'
import { effectiveHold, getFrameAt } from './interpolate'
import {
  newId,
  type Dancer,
  type DancerId,
  type DancerState,
  type Formation,
  type FormationId,
  type Ms,
  type Project,
  type StageConfig,
  type Vec2,
} from './model'
import { floorBounds, reachBounds, round2 } from './stage'

/** A pose edit within this distance of a formation's time edits that formation. */
export const SAME_TIME_TOL_MS = 50
/** Formations must be at least this far apart. */
export const MIN_GAP_MS = 100
/** How far ahead a duplicated formation lands. */
export const DUPLICATE_OFFSET_MS = 2000

/** What to call a formation: its label, or "Formation N" by position when it has none. */
export function formationName(f: Pick<Formation, 'label'>, index: number): string {
  return f.label.trim() || `Formation ${index + 1}`
}

/**
 * Index of the formation the dancers are in at time t, or -1 if they are between formations:
 * the nearest formation within `tol` of t, otherwise the one being held at t.
 */
export function formationIndexAt(formations: Formation[], t: Ms, tol = SAME_TIME_TOL_MS): number {
  let best = -1
  let bestD = tol + 1e-9
  formations.forEach((f, i) => {
    const d = Math.abs(f.timeMs - t)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  })
  if (best >= 0) return best
  return formations.findIndex((f, i) => t >= f.timeMs && t <= f.timeMs + effectiveHold(formations, i))
}

const defaultState = (p: Vec2): DancerState => ({ x: p.x, y: p.y, facing: 0, present: true })

/** Every dancer's pose at time t, in the shape stored on a formation. */
export function framePositions(
  p: Pick<Project, 'dancers' | 'formations' | 'transitions' | 'stage' | 'settings'>,
  t: Ms,
): Record<DancerId, DancerState> {
  const out: Record<DancerId, DancerState> = {}
  if (p.formations.length > 0) {
    const frame = getFrameAt(p, t)
    for (const [id, s] of Object.entries(frame)) {
      out[id] = {
        x: round2(s.x),
        y: round2(s.y),
        facing: round2(s.facing),
        ...(s.level ? { level: s.level } : {}),
        present: s.opacity >= 0.5,
      }
    }
  }
  // Anyone without a pose (e.g. no formations yet) gets a tidy default block.
  const missing = p.dancers.filter((d) => !out[d.id])
  if (missing.length) {
    const spots = arrange(
      'block',
      missing.map((d, i) => ({ id: d.id, x: i, y: 0 })),
      { spacing: defaultSpacing(p.settings.minDistance), center: { x: 0, y: 0 }, bounds: floorBounds(p.stage) },
    )
    for (const d of missing) out[d.id] = defaultState(spots[d.id])
  }
  return out
}

/** First free spot (scanning outward from the center) that keeps `minDist` from everyone. */
export function findFreeSpot(existing: Vec2[], stage: StageConfig, minDist: number): Vec2 {
  const step = Math.max(3, minDist * 1.5)
  const maxX = Math.floor((stage.width / 2 - 1) / step)
  const maxY = Math.floor((stage.depth / 2 - 1) / step)
  const cells: Vec2[] = []
  for (let iy = 0; iy <= maxY * 2; iy++) {
    for (let ix = 0; ix <= maxX * 2; ix++) {
      // 0, +1, -1, +2, -2 ...
      const gx = ix % 2 === 0 ? ix / 2 : -(ix + 1) / 2
      const gy = iy % 2 === 0 ? iy / 2 : -(iy + 1) / 2
      cells.push({ x: gx * step, y: gy * step })
    }
  }
  cells.sort((a, b) => Math.abs(a.y) - Math.abs(b.y) || Math.abs(a.x) - Math.abs(b.x))
  for (const c of cells) {
    if (existing.every((e) => Math.hypot(e.x - c.x, e.y - c.y) >= step * 0.99)) return c
  }
  return { x: 0, y: 0 }
}

/**
 * Add a dancer to the project. They appear in every formation: in the first at `at` (or a free
 * spot), and in later ones where they were in the formation before, so adding someone never
 * disturbs the rest of the routine.
 */
export function addDancerToProject(p: Project, dancer: Dancer, at?: Vec2): void {
  p.dancers.push(dancer)
  if (p.formations.length === 0) addFormationAt(p, 0, newId('form'))
  p.formations.forEach((f, i) => {
    if (i === 0) {
      const taken = Object.values(f.positions)
        .filter((s) => s.present)
        .map((s) => ({ x: s.x, y: s.y }))
      f.positions[dancer.id] = defaultState(at ?? findFreeSpot(taken, p.stage, p.settings.minDistance))
    } else {
      f.positions[dancer.id] = { ...p.formations[i - 1].positions[dancer.id] }
    }
  })
}

function uniqueTime(formations: Formation[], t: Ms, ignoreId?: FormationId): Ms {
  let time = Math.max(0, Math.round(t))
  for (let guard = 0; guard < formations.length + 2; guard++) {
    const hit = formations.find((o) => o.id !== ignoreId && Math.abs(o.timeMs - time) < MIN_GAP_MS)
    if (!hit) break
    time = time >= hit.timeMs ? hit.timeMs + MIN_GAP_MS : Math.max(0, hit.timeMs - MIN_GAP_MS)
  }
  return time
}

/** Create a formation at time t holding everyone's pose at that moment. */
export function addFormationAt(p: Project, t: Ms, id: FormationId = newId('form'), label?: string): FormationId {
  const time = uniqueTime(p.formations, t)
  const positions = framePositions(p, time)
  // Inherit the easing of the transition we are splitting.
  const prevIndex = p.formations.filter((f) => f.timeMs <= time).length - 1
  const prev = p.formations[prevIndex]
  const prevTr = prev ? p.transitions.find((x) => x.fromFormationId === prev.id) : undefined
  // Splitting a hold: the new formation takes over the rest of it, so nobody starts moving early.
  let holdMs = 0
  if (prev) {
    const holdEnd = prev.timeMs + effectiveHold(p.formations, prevIndex)
    if (holdEnd > time) {
      holdMs = holdEnd - time
      prev.holdMs = time - prev.timeMs
    }
  }
  p.formations.push({
    id,
    timeMs: time,
    holdMs,
    label: label ?? '',
    notes: '',
    positions,
  })
  p.formations.sort((a, b) => a.timeMs - b.timeMs)
  if (prevTr) p.transitions.push({ fromFormationId: id, easing: prevTr.easing, perDancer: {} })
  return id
}

/** The formation at time t, creating one (from the current pose) if there is none there. */
export function ensureFormationAt(p: Project, t: Ms, id: FormationId = newId('form')): FormationId {
  const i = formationIndexAt(p.formations, t)
  if (i >= 0) return p.formations[i].id
  return addFormationAt(p, t, id)
}

/** Copy a formation to a little after its hold (halfway to the next one if that is closer). */
export function duplicateFormation(p: Project, sourceId: FormationId, id: FormationId = newId('form')): FormationId | undefined {
  const srcIndex = p.formations.findIndex((f) => f.id === sourceId)
  const src = p.formations[srcIndex]
  if (!src) return undefined
  const next = p.formations[srcIndex + 1]
  const holdEnd = src.timeMs + effectiveHold(p.formations, srcIndex)
  let time = holdEnd + DUPLICATE_OFFSET_MS
  if (next && next.timeMs - holdEnd < DUPLICATE_OFFSET_MS + MIN_GAP_MS * 2) {
    time = holdEnd + (next.timeMs - holdEnd) / 2
  }
  time = uniqueTime(p.formations, time)
  p.formations.push({
    id,
    timeMs: time,
    holdMs: src.holdMs,
    label: src.label.trim() ? `${src.label} (copy)` : '',
    notes: src.notes,
    positions: JSON.parse(JSON.stringify(src.positions)) as Formation['positions'],
  })
  p.formations.sort((a, b) => a.timeMs - b.timeMs)
  const tr = p.transitions.find((x) => x.fromFormationId === src.id)
  p.transitions.push({ fromFormationId: id, easing: tr?.easing ?? 'easeInOut', perDancer: {} })
  return id
}

/** Delete a formation. The last one can't be deleted (dancers would have no positions). */
export function deleteFormation(p: Project, id: FormationId): boolean {
  if (p.formations.length <= 1) return false
  const i = p.formations.findIndex((f) => f.id === id)
  if (i < 0) return false
  p.formations.splice(i, 1)
  p.transitions = p.transitions.filter((t) => t.fromFormationId !== id)
  return true
}

/** Move a formation in time (it may pass other formations). Returns the time it landed on. */
export function setFormationTime(p: Project, id: FormationId, t: Ms): Ms | undefined {
  const f = p.formations.find((x) => x.id === id)
  if (!f) return undefined
  f.timeMs = uniqueTime(p.formations, t, id)
  p.formations.sort((a, b) => a.timeMs - b.timeMs)
  return f.timeMs
}

/**
 * Set how long a formation is held. Normally the hold stops where the next formation starts.
 * Pass `rippleGapMs` to move every later formation along instead, so that the next one starts
 * that long after the hold ends. Returns the hold that was applied.
 */
export function setFormationHold(p: Project, id: FormationId, holdMs: Ms, rippleGapMs?: Ms): Ms | undefined {
  const i = p.formations.findIndex((x) => x.id === id)
  if (i < 0) return undefined
  const f = p.formations[i]
  const next = p.formations[i + 1]
  let hold = Math.max(0, Math.round(holdMs))
  if (next && rippleGapMs !== undefined) {
    const shift = f.timeMs + hold + Math.max(0, Math.round(rippleGapMs)) - next.timeMs
    for (let k = i + 1; k < p.formations.length; k++) p.formations[k].timeMs += shift
  } else if (next) {
    hold = Math.min(hold, next.timeMs - f.timeMs)
  }
  f.holdMs = hold
  return hold
}

/** Merge partial pose changes into a formation. */
export function applyDancerStates(
  p: Project,
  formationId: FormationId,
  patches: Record<DancerId, Partial<DancerState>>,
): void {
  const f = p.formations.find((x) => x.id === formationId)
  if (!f) return
  for (const [id, patch] of Object.entries(patches)) {
    const cur = f.positions[id] ?? defaultState({ x: 0, y: 0 })
    const next = { ...cur, ...patch }
    for (const k of ['x', 'y', 'facing'] as const) next[k] = round2(next[k])
    f.positions[id] = next
  }
}

/** Move a dancer on/off stage. Offstage dancers rest in the wing on the side they were nearest. */
export function withPresence(state: DancerState, present: boolean, stage: StageConfig): Partial<DancerState> {
  const reach = reachBounds(stage)
  const floor = floorBounds(stage)
  const side = state.x >= 0 ? 1 : -1
  if (present) {
    const x = Math.min(floor.maxX - 1.5, Math.max(floor.minX + 1.5, state.x))
    return { present: true, x: round2(x) }
  }
  const wing = stage.wingDepth > 0 ? floor.maxX + stage.wingDepth / 2 : reach.maxX + 1
  return { present: false, x: round2(side * wing) }
}
