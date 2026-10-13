import { describe, expect, it } from 'vitest'
import {
  addDancerToProject,
  addFormationAt,
  applyDancerStates,
  duplicateFormation,
  ensureFormationAt,
  formationIndexAt,
  setFormationHold,
  setFormationTime,
} from './formations'
import { effectiveHold, getDancerStateAt } from './interpolate'
import { SCHEMA_VERSION, createProject, type Project } from './model'
import { parseProject } from './schema'

/** One dancer at x=0 (t=0), x=10 (t=4000) and x=20 (t=10000). */
function routine(): Project {
  const p = createProject()
  addDancerToProject(p, { id: 'd1', name: 'A', number: 1, color: '#fff' }, { x: 0, y: 0 })
  applyDancerStates(p, addFormationAt(p, 4000, 'b'), { d1: { x: 10 } })
  applyDancerStates(p, addFormationAt(p, 10000, 'c'), { d1: { x: 20 } })
  for (const tr of p.transitions) tr.easing = 'linear'
  p.transitions.push({ fromFormationId: p.formations[0].id, easing: 'linear', perDancer: {} })
  return p
}

const xAt = (p: Project, t: number) => getDancerStateAt(p, 'd1', t)!.x
const times = (p: Project) => p.formations.map((f) => f.timeMs)

describe('formation length (hold time)', () => {
  it('new formations start with no hold, so dancers move the whole way between them', () => {
    const p = routine()
    expect(p.formations.map((f) => f.holdMs)).toEqual([0, 0, 0])
    expect(xAt(p, 2000)).toBeCloseTo(5)
  })

  it('holds the formation for its length, then moves in the time that is left', () => {
    const p = routine()
    setFormationHold(p, p.formations[0].id, 3000)
    expect(xAt(p, 0)).toBe(0)
    expect(xAt(p, 1500)).toBe(0)
    expect(xAt(p, 2999)).toBe(0)
    expect(xAt(p, 3500)).toBeCloseTo(5)
    expect(xAt(p, 4000)).toBeCloseTo(10)
  })

  it('each formation can have its own length', () => {
    const p = routine()
    setFormationHold(p, p.formations[0].id, 250)
    setFormationHold(p, 'b', 5000)
    expect(p.formations.map((f) => f.holdMs)).toEqual([250, 5000, 0])
    expect(xAt(p, 8999)).toBe(10)
    expect(xAt(p, 9500)).toBeCloseTo(15)
  })

  it('stops at the next formation unless asked to push it along', () => {
    const p = routine()
    expect(setFormationHold(p, p.formations[0].id, 60_000)).toBe(4000)
    expect(times(p)).toEqual([0, 4000, 10000])
    // Held right up to the next formation: no time to travel, so the dancer jumps.
    expect(xAt(p, 3999)).toBe(0)
    expect(xAt(p, 4000)).toBe(10)
  })

  it('can be any length when later formations are pushed along, keeping the travel time', () => {
    const p = routine()
    const first = p.formations[0].id
    expect(setFormationHold(p, first, 60_000, 4000)).toBe(60_000)
    expect(times(p)).toEqual([0, 64_000, 70_000])
    expect(xAt(p, 59_999)).toBe(0)
    expect(xAt(p, 62_000)).toBeCloseTo(5)
    // Dragging back again pulls the later formations back with it.
    setFormationHold(p, first, 1000, 4000)
    expect(times(p)).toEqual([0, 5000, 11_000])
  })

  it('the last formation can be held for any length', () => {
    const p = routine()
    expect(setFormationHold(p, 'c', 123_456)).toBe(123_456)
    expect(effectiveHold(p.formations, 2)).toBe(123_456)
  })

  it('never goes negative', () => {
    const p = routine()
    expect(setFormationHold(p, 'b', -500)).toBe(0)
  })

  it('a hold is cut short, not lost, when the next formation is dragged into it', () => {
    const p = routine()
    setFormationHold(p, p.formations[0].id, 3000)
    setFormationTime(p, 'b', 2000)
    expect(effectiveHold(p.formations, 0)).toBe(2000)
    expect(xAt(p, 1999)).toBe(0)
    setFormationTime(p, 'b', 6000)
    expect(effectiveHold(p.formations, 0)).toBe(3000)
  })

  it('editing a dancer anywhere in a hold edits that formation instead of adding one', () => {
    const p = routine()
    setFormationHold(p, 'b', 4000) // held 4000–8000, travels 8000–10000
    expect(formationIndexAt(p.formations, 6000)).toBe(1)
    expect(ensureFormationAt(p, 6000)).toBe('b')
    expect(ensureFormationAt(p, 8000)).toBe('b')
    expect(p.formations).toHaveLength(3)
    // While travelling, an edit still adds a formation.
    expect(formationIndexAt(p.formations, 9000)).toBe(-1)
  })

  it('splitting a hold does not make anyone move early', () => {
    const p = routine()
    setFormationHold(p, 'b', 4000)
    const before = [4000, 6000, 7999, 9000, 10000].map((t) => xAt(p, t))
    addFormationAt(p, 6000, 'split')
    expect(p.formations.map((f) => [f.id, f.holdMs]).slice(1, 3)).toEqual([
      ['b', 2000],
      ['split', 2000],
    ])
    expect([4000, 6000, 7999, 9000, 10000].map((t) => xAt(p, t))).toEqual(before)
  })

  it('a duplicate keeps the length and lands after the hold', () => {
    const p = routine()
    setFormationHold(p, 'c', 5000)
    const copy = duplicateFormation(p, 'c', 'copy')
    const f = p.formations.find((x) => x.id === copy)!
    expect(f.holdMs).toBe(5000)
    expect(f.timeMs).toBe(17_000)
  })

  it('opens routines saved before formations had a length, playing back unchanged', () => {
    const p = routine()
    const old = JSON.parse(JSON.stringify(p)) as { schemaVersion: number; formations: { holdMs?: number }[] }
    old.schemaVersion = 1
    for (const f of old.formations) delete f.holdMs
    const back = parseProject(JSON.stringify(old))
    expect(back.schemaVersion).toBe(SCHEMA_VERSION)
    expect(back.formations.map((f) => f.holdMs)).toEqual([0, 0, 0])
    expect(xAt(back, 2000)).toBeCloseTo(xAt(p, 2000))
  })

  it('saves and reloads lengths', () => {
    const p = routine()
    setFormationHold(p, 'b', 2500)
    expect(parseProject(JSON.stringify(p)).formations[1].holdMs).toBe(2500)
  })
})
