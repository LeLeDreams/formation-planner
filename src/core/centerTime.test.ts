import { describe, expect, it } from 'vitest'
import { centerDancersAt, centerTimes, routineEnd } from './centerTime'
import { addDancerToProject, addFormationAt, applyDancerStates, setFormationHold } from './formations'
import { createProject, type Project } from './model'

/**
 * Three dancers. 0–4 s: A is center. Then they travel for 2 s. 6–10 s: B is center, with C
 * standing behind B on the center line.
 */
function routine(): Project {
  const p = createProject()
  addDancerToProject(p, { id: 'a', name: 'A', number: 1, color: '#fff' }, { x: 0, y: 0 })
  addDancerToProject(p, { id: 'b', name: 'B', number: 2, color: '#fff' }, { x: -6, y: 0 })
  addDancerToProject(p, { id: 'c', name: 'C', number: 3, color: '#fff' }, { x: 6, y: 0 })
  setFormationHold(p, p.formations[0].id, 4000)
  applyDancerStates(p, addFormationAt(p, 6000, 'f2'), {
    a: { x: 8, y: 0 },
    b: { x: 0, y: 4 },
    c: { x: 0, y: -4 },
  })
  setFormationHold(p, 'f2', 4000)
  return p
}

describe('who is the center', () => {
  it('is the dancer standing on the center line', () => {
    expect(centerDancersAt(routine(), 1000, 2.5)).toEqual(['a'])
  })

  it('is the front dancer when several stand in the center column', () => {
    expect(centerDancersAt(routine(), 8000, 2.5)).toEqual(['b'])
  })

  it('is nobody when the middle is empty', () => {
    const p = routine()
    applyDancerStates(p, p.formations[0].id, { a: { x: 3 } })
    expect(centerDancersAt(p, 1000, 2.5)).toEqual([])
    // A wider zone reaches them.
    expect(centerDancersAt(p, 1000, 6)).toEqual(['a'])
  })

  it('ignores dancers who are offstage', () => {
    const p = routine()
    applyDancerStates(p, p.formations[0].id, { a: { present: false } })
    expect(centerDancersAt(p, 1000, 2.5)).toEqual([])
  })

  it('prefers whoever is closer to the line, even if someone off to the side is further forward', () => {
    const p = routine()
    applyDancerStates(p, 'f2', { b: { x: 1.2, y: 3 }, c: { x: -0.3, y: 0 } })
    expect(centerDancersAt(p, 8000, 2.5)).toEqual(['c'])
  })

  it('is shared by the middle pair of an even line', () => {
    const p = routine()
    applyDancerStates(p, 'f2', { b: { x: -2, y: 0 }, c: { x: 2, y: 0 } })
    expect(centerDancersAt(p, 8000, 5)).toEqual(['b', 'c'])
    const out = centerTimes(p, 10_000, 5)
    expect(out.perDancer.b).toBeCloseTo(out.perDancer.c)
    expect(out.perDancer.b).toBeGreaterThanOrEqual(2000)
  })
})

describe('center time per dancer', () => {
  it('adds up to the length of the routine', () => {
    const p = routine()
    expect(routineEnd(p)).toBe(10_000)
    const out = centerTimes(p, routineEnd(p), 2.5)
    expect(out.totalMs).toBe(10_000)
    const sum = Object.values(out.perDancer).reduce((a, b) => a + b, 0) + out.noneMs
    expect(sum).toBeCloseTo(10_000)
  })

  it('credits each dancer with the time they hold the center', () => {
    const out = centerTimes(routine(), 10_000, 2.5)
    // A holds it for 4 s and a little longer while walking out of the zone.
    expect(out.perDancer.a).toBeGreaterThanOrEqual(4000)
    expect(out.perDancer.a).toBeLessThan(5000)
    // B holds it for 4 s plus the end of the walk in.
    expect(out.perDancer.b).toBeGreaterThanOrEqual(4000)
    expect(out.perDancer.b).toBeLessThan(5200)
    // C is behind B the whole time, and only passes through alone for a moment at most.
    expect(out.perDancer.c).toBeLessThan(600)
    expect(out.noneMs).toBeGreaterThan(0)
  })

  it('gives every dancer an entry, even with no formations', () => {
    const p = createProject()
    p.dancers.push({ id: 'x', name: 'X', number: 1, color: '#fff' })
    expect(centerTimes(p, 5000, 2.5)).toEqual({ perDancer: { x: 0 }, noneMs: 5000, totalMs: 5000 })
  })

  it('counts time after the last formation when the video runs longer', () => {
    const out = centerTimes(routine(), 20_000, 2.5)
    expect(out.perDancer.b).toBeGreaterThanOrEqual(14_000)
  })
})
