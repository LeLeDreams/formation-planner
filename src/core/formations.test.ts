import { describe, expect, it } from 'vitest'
import { ARRANGE_LABELS, align, arrange, distribute, layout, transformGroup, type ArrangeKind } from './arrange'
import { findCrowded } from './collision'
import {
  addDancerToProject,
  addFormationAt,
  applyDancerStates,
  deleteFormation,
  duplicateFormation,
  ensureFormationAt,
  findFreeSpot,
  formationIndexAt,
  formationName,
  framePositions,
  setFormationTime,
  withPresence,
} from './formations'
import { getDancerStateAt, getFrameAt } from './interpolate'
import { createProject, type Dancer, type Project } from './model'
import { createSampleProject } from './sample'
import { facingToward, floorBounds, fromView, toView, viewExtent } from './stage'
import { snapPoint, snapToGrid } from './snap'
import { parseProject } from './schema'

const dancer = (n: number): Dancer => ({ id: `d${n}`, name: `D${n}`, number: n, color: '#fff' })

function projectWith(n: number): Project {
  const p = createProject()
  for (let i = 1; i <= n; i++) addDancerToProject(p, dancer(i))
  return p
}

describe('stage view transforms', () => {
  it('round-trips every audience side', () => {
    for (const side of ['bottom', 'top', 'left', 'right'] as const) {
      const p = { x: 3.5, y: -7 }
      const back = fromView(toView(p, side), side)
      expect(back.x).toBeCloseTo(p.x)
      expect(back.y).toBeCloseTo(p.y)
    }
  })
  it('puts the audience (+y) on the requested screen side', () => {
    expect(toView({ x: 0, y: 1 }, 'bottom')).toEqual({ x: 0, y: 1 })
    expect(toView({ x: 0, y: 1 }, 'top')).toEqual({ x: 0, y: -1 })
    expect(toView({ x: 0, y: 1 }, 'right')).toEqual({ x: 1, y: 0 })
    expect(toView({ x: 0, y: 1 }, 'left')).toEqual({ x: -1, y: 0 })
  })
  it('swaps extent for sideways audiences', () => {
    const s = { width: 40, depth: 30, wingDepth: 6, audienceSide: 'left' as const }
    expect(viewExtent(s)).toEqual({ w: 30, h: 52 })
    expect(viewExtent({ ...s, audienceSide: 'bottom' })).toEqual({ w: 52, h: 30 })
  })
  it('computes facing toward a point', () => {
    expect(facingToward({ x: 0, y: 0 }, { x: 0, y: 5 })).toBeCloseTo(0)
    expect(facingToward({ x: 0, y: 0 }, { x: -5, y: 0 })).toBeCloseTo(90)
    expect(facingToward({ x: 0, y: 0 }, { x: 0, y: -5 })).toBeCloseTo(180)
    expect(facingToward({ x: 0, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(270)
  })
})

describe('snapping', () => {
  it('snaps to the grid', () => {
    expect(snapToGrid(2.4, 1)).toBe(2)
    expect(snapToGrid(-0.2, 1)).toBe(0)
    expect(snapToGrid(7.3, 0.5)).toBe(7.5)
  })
  it('snaps to grid when no guide is near', () => {
    const r = snapPoint({ x: 3.4, y: 8.6 }, { grid: 1, targets: [], threshold: 0.3, guides: true })
    expect(r.x).toBe(3)
    expect(r.y).toBe(9)
    expect(r.guides).toEqual([])
  })
  it('prefers a guide on another dancer over the grid', () => {
    const r = snapPoint({ x: 5.2, y: 9.9 }, { grid: 1, targets: [{ x: 5.35, y: 0 }], threshold: 0.4, guides: true })
    expect(r.x).toBe(5.35)
    expect(r.guides).toContainEqual({ axis: 'x', value: 5.35 })
    expect(r.y).toBe(10)
  })
  it('snaps to the center line', () => {
    const r = snapPoint({ x: 0.2, y: 4 }, { grid: null, targets: [], threshold: 0.5, guides: true })
    expect(r.x).toBe(0)
    expect(r.guides).toContainEqual({ axis: 'x', value: 0 })
  })
  it('does nothing with grid and guides off', () => {
    const r = snapPoint({ x: 1.23, y: 4.56 }, { grid: null, targets: [{ x: 1.2, y: 4.5 }], threshold: 1, guides: false })
    expect(r).toMatchObject({ x: 1.23, y: 4.56, guides: [] })
  })
})

describe('collision', () => {
  it('flags only dancers that are too close', () => {
    const s = findCrowded(
      [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 1, y: 0 }, { id: 'c', x: 10, y: 0 }],
      2,
    )
    expect([...s].sort()).toEqual(['a', 'b'])
  })
  it('flags nobody at exactly the minimum distance', () => {
    expect(findCrowded([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 2, y: 0 }], 2).size).toBe(0)
  })
})

describe('arrangements', () => {
  const kinds = Object.keys(ARRANGE_LABELS) as ArrangeKind[]
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, x: i * 2 - n, y: (i % 3) * 2 }))

  it('gives every dancer a unique slot for any count and shape', () => {
    for (const kind of kinds) {
      for (const n of [1, 2, 3, 5, 8, 13, 30]) {
        const out = arrange(kind, items(n), { spacing: 4, center: { x: 0, y: 0 } })
        expect(Object.keys(out)).toHaveLength(n)
        const keys = new Set(Object.values(out).map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`))
        expect(keys.size).toBe(n)
      }
    }
  })
  it('keeps dancers at least `spacing` apart (so shapes never crowd)', () => {
    for (const kind of ['line', 'circle', 'block'] as ArrangeKind[]) {
      const pts = Object.values(arrange(kind, items(12), { spacing: 4, center: { x: 0, y: 0 } }))
      let min = Infinity
      pts.forEach((a, i) => pts.slice(i + 1).forEach((b) => (min = Math.min(min, Math.hypot(a.x - b.x, a.y - b.y)))))
      expect(min).toBeGreaterThanOrEqual(3.99)
    }
  })
  it('centers the shape on the requested point', () => {
    const out = Object.values(arrange('line', items(5), { spacing: 3, center: { x: 4, y: -2 } }))
    expect(out.reduce((a, p) => a + p.x, 0) / 5).toBeCloseTo(4)
    expect(out.every((p) => p.y === -2)).toBe(true)
  })
  it('makes a V that points toward the audience', () => {
    const { slots } = layout('v', 5, 4)
    const apex = slots[2]
    expect(slots.every((s) => s.y <= apex.y + 1e-9)).toBe(true)
  })
  it('fits inside bounds, shrinking when needed', () => {
    const b = floorBounds({ width: 20, depth: 10 })
    const out = Object.values(arrange('line', items(10), { spacing: 5, center: { x: 0, y: 0 }, bounds: b }))
    expect(Math.max(...out.map((p) => p.x))).toBeLessThanOrEqual(b.maxX - 1 + 1e-9)
    expect(Math.min(...out.map((p) => p.x))).toBeGreaterThanOrEqual(b.minX + 1 - 1e-9)
  })
  it('assigns a line left-to-right so paths do not cross', () => {
    const its = [{ id: 'a', x: 5, y: 0 }, { id: 'b', x: -5, y: 0 }, { id: 'c', x: 0, y: 0 }]
    const out = arrange('line', its, { spacing: 4, center: { x: 0, y: 0 } })
    expect(out.b.x).toBeLessThan(out.c.x)
    expect(out.c.x).toBeLessThan(out.a.x)
  })
  it('handles empty input', () => {
    expect(arrange('circle', [], { spacing: 3 })).toEqual({})
  })
})

describe('align, distribute, transform', () => {
  const its = [{ id: 'a', x: 0, y: 1 }, { id: 'b', x: 10, y: 5 }, { id: 'c', x: 4, y: 9 }]
  it('aligns edges and centers', () => {
    expect(align(its, 'left').c.x).toBe(0)
    expect(align(its, 'right').a.x).toBe(10)
    expect(align(its, 'centerX').a.x).toBe(5)
    expect(align(its, 'top').b.y).toBe(1)
    expect(align(its, 'bottom').a.y).toBe(9)
    expect(align(its, 'centerY').c.y).toBe(5)
  })
  it('distributes evenly between the outermost dancers', () => {
    const out = distribute(its, 'x')
    expect(out.a.x).toBe(0)
    expect(out.c.x).toBe(5)
    expect(out.b.x).toBe(10)
  })
  it('leaves fewer than three dancers alone', () => {
    expect(distribute(its.slice(0, 2), 'x')).toEqual({ a: { x: 0, y: 1 }, b: { x: 10, y: 5 } })
  })
  it('rotates about the centroid, preserving distances', () => {
    const out = transformGroup(its, { rotateDeg: 90 })
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y)
    expect(d(out.a, out.b)).toBeCloseTo(d(its[0], its[1]))
    expect(transformGroup(its, { rotateDeg: 360 }).a.x).toBeCloseTo(0)
  })
  it('scales about the centroid', () => {
    const out = transformGroup(its, { scale: 2 })
    expect(Math.hypot(out.a.x - out.b.x, out.a.y - out.b.y)).toBeCloseTo(2 * Math.hypot(0 - 10, 1 - 5))
  })
})

describe('adding dancers', () => {
  it('creates a first formation and places dancers without overlapping', () => {
    const p = projectWith(10)
    expect(p.formations).toHaveLength(1)
    const pts = Object.entries(p.formations[0].positions).map(([id, s]) => ({ id, x: s.x, y: s.y }))
    expect(pts).toHaveLength(10)
    expect(findCrowded(pts, p.settings.minDistance).size).toBe(0)
  })
  it('keeps a new dancer in the same spot in later formations', () => {
    const p = projectWith(2)
    addFormationAt(p, 4000)
    addDancerToProject(p, dancer(3))
    expect(p.formations[1].positions.d3).toEqual(p.formations[0].positions.d3)
  })
  it('finds a free spot even on a crowded stage', () => {
    const stage = createProject().stage
    const taken = Array.from({ length: 12 }, (_, i) => ({ x: (i % 6) * 3 - 7, y: Math.floor(i / 6) * 3 }))
    const spot = findFreeSpot(taken, stage, 2)
    expect(taken.every((t) => Math.hypot(t.x - spot.x, t.y - spot.y) >= 2)).toBe(true)
  })
})

describe('formation operations', () => {
  it('adds a formation holding the interpolated pose at that moment', () => {
    const p = projectWith(1)
    applyDancerStates(p, p.formations[0].id, { d1: { x: 0, y: 0 } })
    const second = addFormationAt(p, 4000)
    applyDancerStates(p, second, { d1: { x: 10, y: 0 } })
    const mid = addFormationAt(p, 2000)
    const f = p.formations.find((x) => x.id === mid)!
    expect(f.positions.d1.x).toBeCloseTo(5, 1) // easeInOut midpoint
    expect(p.formations.map((x) => x.timeMs)).toEqual([0, 2000, 4000])
  })
  it('does not change what the routine looks like when a formation is inserted', () => {
    const p = projectWith(1)
    const b = addFormationAt(p, 6000)
    applyDancerStates(p, b, { d1: { x: 12, y: 4 } })
    const before = getDancerStateAt(p, 'd1', 3000)!
    addFormationAt(p, 3000)
    const after = getDancerStateAt(p, 'd1', 3000)!
    expect(after.x).toBeCloseTo(before.x, 1)
    expect(after.y).toBeCloseTo(before.y, 1)
  })
  it('ensureFormationAt reuses a formation within tolerance, otherwise creates one', () => {
    const p = projectWith(1)
    const f0 = p.formations[0].id
    expect(ensureFormationAt(p, 30)).toBe(f0)
    expect(p.formations).toHaveLength(1)
    const made = ensureFormationAt(p, 5000)
    expect(made).not.toBe(f0)
    expect(p.formations).toHaveLength(2)
  })
  it('keeps formations at least 100ms apart', () => {
    const p = projectWith(1)
    addFormationAt(p, 1000)
    addFormationAt(p, 1010)
    const times = p.formations.map((f) => f.timeMs)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(100)
  })
  it('duplicates a formation later in time with the same pose', () => {
    const p = projectWith(3)
    p.formations[0].label = 'Opening'
    const copy = duplicateFormation(p, p.formations[0].id)!
    const f = p.formations.find((x) => x.id === copy)!
    expect(f.timeMs).toBe(2000)
    expect(f.positions).toEqual(p.formations[0].positions)
    expect(f.positions).not.toBe(p.formations[0].positions)
    expect(f.label).toContain('(copy)')
  })
  it('duplicates halfway when the next formation is close', () => {
    const p = projectWith(1)
    addFormationAt(p, 1000)
    const copy = duplicateFormation(p, p.formations[0].id)!
    expect(p.formations.find((x) => x.id === copy)!.timeMs).toBe(500)
  })
  it('deletes a formation and its transition, but never the last one', () => {
    const p = projectWith(1)
    const second = addFormationAt(p, 3000)
    expect(deleteFormation(p, second)).toBe(true)
    expect(p.transitions.some((t) => t.fromFormationId === second)).toBe(false)
    expect(deleteFormation(p, p.formations[0].id)).toBe(false)
    expect(p.formations).toHaveLength(1)
  })
  it('retimes and reorders formations', () => {
    const p = projectWith(1)
    const a = p.formations[0].id
    const b = addFormationAt(p, 2000)
    setFormationTime(p, a, 5000)
    expect(p.formations.map((f) => f.id)).toEqual([b, a])
  })
  it('names unlabeled formations by their position', () => {
    expect(formationName({ label: '' }, 1)).toBe('Formation 2')
    expect(formationName({ label: '   ' }, 0)).toBe('Formation 1')
    expect(formationName({ label: 'Chorus' }, 4)).toBe('Chorus')
  })
  it('finds the formation at a time', () => {
    const p = projectWith(1)
    addFormationAt(p, 2000)
    expect(formationIndexAt(p.formations, 2040)).toBe(1)
    expect(formationIndexAt(p.formations, 1000)).toBe(-1)
  })
  it('frames dancers without a pose into a default block', () => {
    const p = createProject()
    p.dancers = [dancer(1), dancer(2), dancer(3)]
    expect(Object.keys(framePositions(p, 0))).toHaveLength(3)
  })
})

describe('offstage', () => {
  it('moves a dancer into the wing and back onto the floor', () => {
    const stage = createProject().stage
    const off = withPresence({ x: 5, y: 2, facing: 0, present: true }, false, stage)
    expect(off.present).toBe(false)
    expect(off.x!).toBeGreaterThan(stage.width / 2)
    const on = withPresence({ x: off.x!, y: 2, facing: 0, present: false }, true, stage)
    expect(on.x!).toBeLessThan(stage.width / 2)
  })
  it('fades a dancer in over a transition', () => {
    const p = projectWith(1)
    const first = p.formations[0].id
    applyDancerStates(p, first, { d1: { ...withPresence(p.formations[0].positions.d1, false, p.stage) } })
    const second = addFormationAt(p, 4000)
    applyDancerStates(p, second, { d1: { present: true, x: 0, y: 0 } })
    expect(getDancerStateAt(p, 'd1', 0)!.opacity).toBe(0)
    expect(getDancerStateAt(p, 'd1', 2000)!.opacity).toBeCloseTo(0.5, 1)
    expect(getDancerStateAt(p, 'd1', 4000)!.opacity).toBe(1)
  })
})

describe('sample project', () => {
  const sample = createSampleProject()
  it('is a valid project file', () => {
    expect(parseProject(JSON.stringify(sample)).dancers).toHaveLength(8)
  })
  it('keeps every dancer on the floor and uncrowded at every formation', () => {
    const b = floorBounds(sample.stage)
    for (const f of sample.formations) {
      const pts = sample.dancers.map((d) => ({ id: d.id, ...f.positions[d.id] }))
      for (const p of pts) {
        expect(p.x).toBeGreaterThanOrEqual(b.minX)
        expect(p.x).toBeLessThanOrEqual(b.maxX)
        expect(p.y).toBeGreaterThanOrEqual(b.minY)
        expect(p.y).toBeLessThanOrEqual(b.maxY)
      }
      expect(findCrowded(pts, sample.settings.minDistance).size, f.label).toBe(0)
    }
  })
  it('animates without NaN between formations', () => {
    for (let t = 0; t <= 22000; t += 250) {
      for (const s of Object.values(getFrameAt(sample, t))) {
        expect(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.facing)).toBe(true)
      }
    }
  })
})

describe('describePosition', () => {
  it('describes positions from the performer’s point of view', async () => {
    const { describePosition } = await import('./describe')
    expect(describePosition(0, 0, 'ft')).toBe('Center stage')
    expect(describePosition(3, 0, 'ft')).toBe('3 ft stage left of center')
    expect(describePosition(-4.5, -2, 'm')).toBe('4.5 m stage right, 2 m upstage of center')
    expect(describePosition(1, 6, 'ft', false)).toBe('Offstage')
  })
})
