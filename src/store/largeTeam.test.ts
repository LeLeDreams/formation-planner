import { beforeEach, describe, expect, it } from 'vitest'
import { arrange, defaultSpacing, type ArrangeKind } from '@/core/arrange'
import { findCrowded } from '@/core/collision'
import { getFrameAt } from '@/core/interpolate'
import { DANCER_COLORS, MAX_DANCERS, createProject, type Project } from '@/core/model'
import { parseProject } from '@/core/schema'
import { floorBounds } from '@/core/stage'
import { useProjectStore } from './projectStore'

const project = (): Project => useProjectStore.getState().history.present

const onStage = (p: Project, t = 0) => {
  const frame = getFrameAt(p, t)
  return p.dancers.map((d) => ({ id: d.id, x: frame[d.id].x, y: frame[d.id].y }))
}

beforeEach(() => useProjectStore.getState().loadProject(createProject()))

describe('large teams (20–30 dancers)', () => {
  it('has a distinct color for each of 30 dancers', () => {
    expect(new Set(DANCER_COLORS).size).toBeGreaterThanOrEqual(30)
    useProjectStore.getState().addDancers(30)
    expect(new Set(project().dancers.map((d) => d.color)).size).toBe(30)
    expect(project().dancers.map((d) => d.number)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1))
  })

  for (const n of [20, 24, 30]) {
    it(`places a new team of ${n} on the default stage without crowding anyone`, () => {
      useProjectStore.getState().addDancers(n)
      const p = project()
      const pts = onStage(p)
      const b = floorBounds(p.stage)
      expect(pts).toHaveLength(n)
      for (const pt of pts) {
        expect(pt.x).toBeGreaterThanOrEqual(b.minX)
        expect(pt.x).toBeLessThanOrEqual(b.maxX)
        expect(pt.y).toBeGreaterThanOrEqual(b.minY)
        expect(pt.y).toBeLessThanOrEqual(b.maxY)
      }
      expect(findCrowded(pts, p.settings.minDistance).size).toBe(0)
    })
  }

  it('grows a team of 8 to 30 with everyone in a free spot', () => {
    const s = useProjectStore.getState()
    s.addDancers(8)
    s.addDancers(22)
    const p = project()
    expect(p.dancers).toHaveLength(30)
    expect(findCrowded(onStage(p), p.settings.minDistance).size).toBe(0)
  })

  it('adding dancers one at a time up to 30 never stacks them', () => {
    for (let i = 0; i < 30; i++) useProjectStore.getState().addDancer()
    const p = project()
    expect(p.dancers).toHaveLength(30)
    expect(findCrowded(onStage(p), p.settings.minDistance).size).toBe(0)
  })

  it(`stops at ${MAX_DANCERS} dancers`, () => {
    const s = useProjectStore.getState()
    s.addDancers(30)
    s.addDancers(30)
    expect(project().dancers).toHaveLength(MAX_DANCERS)
    expect(s.addDancer()).toBeUndefined()
    expect(project().dancers).toHaveLength(MAX_DANCERS)
  })

  it('keeps every arrangement of 30 inside the stage', () => {
    useProjectStore.getState().addDancers(30)
    const p = project()
    const b = floorBounds(p.stage)
    for (const kind of ['line', 'circle', 'arc', 'v', 'diagonal', 'block'] satisfies ArrangeKind[]) {
      const out = arrange(kind, onStage(p), { spacing: defaultSpacing(p.settings.minDistance), bounds: b })
      const pts = Object.values(out)
      expect(pts, kind).toHaveLength(30)
      expect(new Set(pts.map((q) => `${q.x.toFixed(3)},${q.y.toFixed(3)}`)).size, kind).toBe(30)
      for (const q of pts) {
        expect(q.x, kind).toBeGreaterThanOrEqual(b.minX)
        expect(q.x, kind).toBeLessThanOrEqual(b.maxX)
        expect(q.y, kind).toBeGreaterThanOrEqual(b.minY)
        expect(q.y, kind).toBeLessThanOrEqual(b.maxY)
      }
    }
  })

  it('a 30-dancer routine with many formations survives save and load, and stays fast', () => {
    const s = useProjectStore.getState()
    s.addDancers(30)
    for (let f = 1; f <= 40; f++) {
      const patches = Object.fromEntries(project().dancers.map((d, i) => [d.id, { x: (i % 10) - 5 + f * 0.1, y: (i % 3) * 4 - 4 }]))
      s.setPoses(f * 4000, patches, 'Move dancers')
    }
    const p = project()
    expect(p.formations).toHaveLength(41)
    const back = parseProject(JSON.stringify(p))
    expect(back).toEqual(JSON.parse(JSON.stringify(p)))

    // A frame is computed on every animation tick during playback.
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      const frame = getFrameAt(p, (i * 163) % 160_000)
      findCrowded(p.dancers.map((d) => ({ id: d.id, x: frame[d.id].x, y: frame[d.id].y })), p.settings.minDistance)
    }
    expect((performance.now() - start) / 1000).toBeLessThan(2) // ms per frame; budget is 16
  })
})
