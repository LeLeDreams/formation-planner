import { clamp01, ease } from './easing'
import type {
  DancerId,
  DancerState,
  DancerTransition,
  Formation,
  Ms,
  Project,
  Transition,
  Vec2,
} from './model'

/** Shortest-arc interpolation between two angles in degrees. */
export function lerpAngle(a: number, b: number, t: number): number {
  const diff = ((((b - a) % 360) + 540) % 360) - 180
  return a + diff * t
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export function quadBezier(p0: Vec2, c: Vec2, p1: Vec2, t: number): Vec2 {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x,
    y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y,
  }
}

/**
 * Index of the last formation whose timeMs <= t, or -1 when t is before the first.
 * Formations must be sorted ascending.
 */
export function findFormationIndex(formations: Formation[], t: Ms): number {
  let lo = 0
  let hi = formations.length - 1
  let ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (formations[mid].timeMs <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return ans
}

/**
 * How long formation `i` is really held: its `holdMs`, cut short if the next formation starts
 * before the hold is over. The move to the next formation fills the rest of the gap.
 */
export function effectiveHold(formations: Formation[], i: number): Ms {
  const f = formations[i]
  if (!f) return 0
  const hold = Math.max(0, f.holdMs)
  const next = formations[i + 1]
  return next ? Math.min(hold, Math.max(0, next.timeMs - f.timeMs)) : hold
}

const DEFAULT_TRANSITION: Pick<Transition, 'easing'> = { easing: 'easeInOut' }

export function getTransition(
  transitions: Transition[],
  fromFormationId: string,
): Transition | undefined {
  return transitions.find((tr) => tr.fromFormationId === fromFormationId)
}

/** Default control point for a curved path: perpendicular offset from the midpoint. */
export function defaultControl(a: Vec2, b: Vec2): Vec2 {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  return { x: mx - dy * 0.35, y: my + dx * 0.35 }
}

/** Position of a dancer along its path at eased progress p (0..1), ignoring timing. */
export function pathPoint(
  from: DancerState,
  to: DancerState,
  dt: DancerTransition | undefined,
  p: number,
): Vec2 {
  if (dt?.path === 'curved') {
    const c = dt.control ?? defaultControl(from, to)
    return quadBezier(from, c, to, p)
  }
  return { x: lerp(from.x, to.x, p), y: lerp(from.y, to.y, p) }
}

/**
 * Interpolated state for one dancer between two formations.
 * Entering/exiting dancers slide between their offstage rest position and onstage spot;
 * `opacity` is 0 when fully offstage and 1 when fully present.
 */
export function interpolateDancer(
  from: DancerState,
  to: DancerState,
  progress: number,
  easing: Transition['easing'],
  dt?: DancerTransition,
): DancerState & { opacity: number } {
  const delay = Math.min(0.9, Math.max(0, dt?.delayFrac ?? 0))
  // Remap progress so the dancer waits `delay` then moves over the remaining span.
  const local = delay >= 1 ? 1 : clamp01((progress - delay) / (1 - delay))
  const p = ease(easing, local)
  const pt = pathPoint(from, to, dt, p)
  const fromOp = from.present ? 1 : 0
  const toOp = to.present ? 1 : 0
  return {
    x: pt.x,
    y: pt.y,
    facing: lerpAngle(from.facing, to.facing, p),
    level: p < 0.5 ? from.level : to.level,
    present: from.present || to.present,
    opacity: lerp(fromOp, toOp, p),
  }
}

export type PlayedState = DancerState & { opacity: number }

/**
 * Where a dancer is at time t. Before the first formation the first formation's pose is
 * held; after the last, the last pose is held. Between two formations the dancer first holds
 * the earlier one for its hold time, then moves.
 */
export function getDancerStateAt(
  project: Pick<Project, 'formations' | 'transitions'>,
  dancerId: DancerId,
  t: Ms,
): PlayedState | undefined {
  const { formations, transitions } = project
  if (formations.length === 0) return undefined
  const i = findFormationIndex(formations, t)
  const cur = formations[Math.max(0, i)]
  const next = i >= 0 ? formations[i + 1] : undefined
  const curState = cur.positions[dancerId]
  if (!curState) return undefined
  const hold = (s: DancerState): PlayedState => ({ ...s, opacity: s.present ? 1 : 0 })
  if (i < 0 || !next) return hold(curState)
  const nextState = next.positions[dancerId] ?? curState
  const moveStart = cur.timeMs + effectiveHold(formations, i)
  if (t < moveStart) return hold(curState)
  const span = next.timeMs - moveStart
  if (span <= 0) return hold(nextState)
  const progress = clamp01((t - moveStart) / span)
  const tr = getTransition(transitions, cur.id)
  return interpolateDancer(
    curState,
    nextState,
    progress,
    tr?.easing ?? DEFAULT_TRANSITION.easing,
    tr?.perDancer[dancerId],
  )
}

/** All dancers' states at time t. */
export function getFrameAt(
  project: Pick<Project, 'formations' | 'transitions' | 'dancers'>,
  t: Ms,
): Record<DancerId, PlayedState> {
  const out: Record<DancerId, PlayedState> = {}
  for (const d of project.dancers) {
    const s = getDancerStateAt(project, d.id, t)
    if (s) out[d.id] = s
  }
  return out
}
