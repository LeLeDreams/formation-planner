import { describe, expect, it } from 'vitest'
import { ease } from './easing'
import {
  findFormationIndex,
  getDancerStateAt,
  getFrameAt,
  lerpAngle,
  quadBezier,
} from './interpolate'
import type { Formation, Transition } from './model'

const f = (id: string, timeMs: number, x: number, y: number, extra = {}): Formation => ({
  id,
  timeMs,
  holdMs: 0,
  label: id,
  notes: '',
  positions: { d1: { x, y, facing: 0, present: true, ...extra } },
})

describe('easing', () => {
  it('hits endpoints for every easing', () => {
    for (const name of ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const) {
      expect(ease(name, 0)).toBe(0)
      expect(ease(name, 1)).toBe(1)
    }
  })
  it('easeInOut is symmetric about the midpoint', () => {
    expect(ease('easeInOut', 0.5)).toBeCloseTo(0.5)
  })
  it('clamps out-of-range input', () => {
    expect(ease('linear', -1)).toBe(0)
    expect(ease('linear', 2)).toBe(1)
  })
  it('hold stays at 0 until the end', () => {
    expect(ease('hold', 0.99)).toBe(0)
    expect(ease('hold', 1)).toBe(1)
  })
})

describe('lerpAngle', () => {
  it('takes the shortest arc across 0/360', () => {
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(360)
  })
  it('goes the other way when shorter', () => {
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0)
  })
})

describe('quadBezier', () => {
  it('starts and ends at the endpoints', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    const c = { x: 5, y: 8 }
    expect(quadBezier(a, c, b, 0)).toEqual(a)
    expect(quadBezier(a, c, b, 1)).toEqual(b)
    expect(quadBezier(a, c, b, 0.5).y).toBeCloseTo(4)
  })
})

describe('findFormationIndex', () => {
  const fs = [f('a', 0, 0, 0), f('b', 1000, 0, 0), f('c', 2000, 0, 0)]
  it('returns -1 before the first formation', () => {
    expect(findFormationIndex([f('a', 500, 0, 0)], 100)).toBe(-1)
  })
  it('finds the last formation at or before t', () => {
    expect(findFormationIndex(fs, 0)).toBe(0)
    expect(findFormationIndex(fs, 999)).toBe(0)
    expect(findFormationIndex(fs, 1000)).toBe(1)
    expect(findFormationIndex(fs, 99999)).toBe(2)
  })
  it('handles empty list', () => {
    expect(findFormationIndex([], 5)).toBe(-1)
  })
})

describe('getDancerStateAt', () => {
  const linear: Transition = { fromFormationId: 'a', easing: 'linear', perDancer: {} }
  const proj = {
    formations: [f('a', 1000, 0, 0), f('b', 3000, 10, 20)],
    transitions: [linear],
  }

  it('holds the first pose before the first formation', () => {
    expect(getDancerStateAt(proj, 'd1', 0)).toMatchObject({ x: 0, y: 0 })
  })
  it('holds the last pose after the last formation', () => {
    expect(getDancerStateAt(proj, 'd1', 9999)).toMatchObject({ x: 10, y: 20 })
  })
  it('interpolates linearly at the midpoint', () => {
    expect(getDancerStateAt(proj, 'd1', 2000)).toMatchObject({ x: 5, y: 10 })
  })
  it('lands exactly on a formation at its timestamp', () => {
    expect(getDancerStateAt(proj, 'd1', 3000)).toMatchObject({ x: 10, y: 20 })
  })
  it('returns undefined for unknown dancer or no formations', () => {
    expect(getDancerStateAt(proj, 'nope', 2000)).toBeUndefined()
    expect(getDancerStateAt({ formations: [], transitions: [] }, 'd1', 0)).toBeUndefined()
  })
  it('applies a per-dancer start delay', () => {
    const p = {
      ...proj,
      transitions: [
        { ...linear, perDancer: { d1: { path: 'straight' as const, delayFrac: 0.5 } } },
      ],
    }
    // Halfway through the span the delayed dancer has not started yet.
    expect(getDancerStateAt(p, 'd1', 2000)).toMatchObject({ x: 0, y: 0 })
    // At 75% progress it is halfway through its remaining motion.
    expect(getDancerStateAt(p, 'd1', 2500)).toMatchObject({ x: 5, y: 10 })
  })
  it('follows a curved path off the straight line', () => {
    const p = {
      ...proj,
      transitions: [
        {
          ...linear,
          perDancer: { d1: { path: 'curved' as const, control: { x: 10, y: 0 } } },
        },
      ],
    }
    const s = getDancerStateAt(p, 'd1', 2000)!
    expect(s.x).toBeCloseTo(0.25 * 0 + 0.5 * 10 + 0.25 * 10)
    expect(s.y).toBeCloseTo(0.25 * 20)
  })
  it('fades a dancer entering the stage', () => {
    const p = {
      formations: [f('a', 0, -30, 0, { present: false }), f('b', 2000, 0, 0)],
      transitions: [linear],
    }
    expect(getDancerStateAt(p, 'd1', 0)!.opacity).toBe(0)
    expect(getDancerStateAt(p, 'd1', 1000)!.opacity).toBeCloseTo(0.5)
    expect(getDancerStateAt(p, 'd1', 2000)!.opacity).toBe(1)
  })
  it('handles two formations at the same time without dividing by zero', () => {
    const p = { formations: [f('a', 1000, 0, 0), f('b', 1000, 4, 4)], transitions: [] }
    const s = getDancerStateAt(p, 'd1', 1000)!
    expect(Number.isFinite(s.x)).toBe(true)
  })
})

describe('getFrameAt', () => {
  it('returns a state for every dancer present in the formations', () => {
    const project = {
      dancers: [
        { id: 'd1', name: 'A', number: 1, color: '#fff' },
        { id: 'ghost', name: 'B', number: 2, color: '#fff' },
      ],
      formations: [f('a', 0, 1, 2)],
      transitions: [],
    }
    const frame = getFrameAt(project, 0)
    expect(Object.keys(frame)).toEqual(['d1'])
  })
})
