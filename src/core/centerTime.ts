import { effectiveHold, getFrameAt } from './interpolate'
import type { DancerId, Ms, Project } from './model'

type Routine = Pick<Project, 'dancers' | 'formations' | 'transitions'>

/** Positions closer together than this (in stage units) count as level. */
const LEVEL_TOL = 0.25

/**
 * Who is "the center" at time t. Of the dancers on stage standing within `zoneWidth / 2` of the
 * center line, it is the one closest to the line; if several are equally close (a column down
 * the middle), the one nearest the audience. Dancers who are still level after that share the
 * center, e.g. the middle pair of an even-numbered line. Empty if no one is standing in the zone.
 */
export function centerDancersAt(project: Routine, t: Ms, zoneWidth: number): DancerId[] {
  const frame = getFrameAt(project, t)
  const half = zoneWidth / 2 + 1e-6
  const inZone: { id: DancerId; ax: number; y: number }[] = []
  for (const d of project.dancers) {
    const s = frame[d.id]
    if (!s || s.opacity < 0.5) continue
    const ax = Math.abs(s.x)
    if (ax <= half) inZone.push({ id: d.id, ax, y: s.y })
  }
  if (!inZone.length) return []
  const minX = Math.min(...inZone.map((c) => c.ax))
  const closest = inZone.filter((c) => c.ax - minX <= LEVEL_TOL)
  const front = Math.max(...closest.map((c) => c.y))
  return closest.filter((c) => front - c.y <= LEVEL_TOL).map((c) => c.id)
}

/** When the routine ends if there is no video to say so: the end of the last formation's hold. */
export function routineEnd(project: Pick<Project, 'formations'>): Ms {
  const n = project.formations.length
  return n ? project.formations[n - 1].timeMs + effectiveHold(project.formations, n - 1) : 0
}

export interface CenterTimes {
  /** Time each dancer spends as the center (shared moments are split evenly). Every dancer has an entry. */
  perDancer: Record<DancerId, Ms>
  /** Time with nobody in the center. */
  noneMs: Ms
  totalMs: Ms
}

/**
 * How long each dancer is the center between 0 and `endMs`, measured by looking at the stage
 * every `stepMs` (so it counts moves through the center as well as held formations).
 */
export function centerTimes(project: Routine, endMs: Ms, zoneWidth: number, stepMs = 100): CenterTimes {
  const perDancer: Record<DancerId, Ms> = {}
  for (const d of project.dancers) perDancer[d.id] = 0
  const totalMs = Math.max(0, endMs)
  let noneMs = 0
  if (project.formations.length === 0) return { perDancer, noneMs: totalMs, totalMs }
  for (let t = 0; t < totalMs; t += stepMs) {
    const slice = Math.min(stepMs, totalMs - t)
    // Look at the middle of each slice so a change exactly on a boundary is split fairly.
    const ids = centerDancersAt(project, t + slice / 2, zoneWidth)
    for (const id of ids) perDancer[id] += slice / ids.length
    if (!ids.length) noneMs += slice
  }
  return { perDancer, noneMs, totalMs }
}
