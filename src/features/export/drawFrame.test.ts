import { describe, expect, it } from 'vitest'
import { createSampleProject } from '@/core/sample'
import { drawHeader, drawStage, pipRect, stageArea, type Corner, type FrameColors } from './drawFrame'
import { routineLength } from './exportVideo'

const colors: FrameColors = {
  background: '#fff', floor: '#eee', wing: '#ddd', border: '#ccc', grid: '#ccc',
  center: '#609', front: '#609', ink: '#222', muted: '#777',
}

/** A stand-in 2D context that records every call (jsdom has no canvas). */
function fakeContext() {
  const calls: { name: string; args: unknown[] }[] = []
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, prop: string) => {
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (s: string) => ({ width: s.length * 10 })
      return (...args: unknown[]) => void calls.push({ name: prop, args })
    },
    set: (target, prop: string, value) => {
      target[prop] = value
      return true
    },
  })
  const texts = () => calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]))
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls, texts }
}

describe('export frame layout', () => {
  it('puts the reference video in the chosen corner, inside the frame, in its own shape', () => {
    for (const corner of ['top-left', 'top-right', 'bottom-left', 'bottom-right'] satisfies Corner[]) {
      for (const aspect of [16 / 9, 9 / 16, 1]) {
        const r = pipRect(1280, 720, corner, aspect, 0.28)
        expect(r.x, corner).toBeGreaterThanOrEqual(0)
        expect(r.y, corner).toBeGreaterThanOrEqual(0)
        expect(r.x + r.w, corner).toBeLessThanOrEqual(1280)
        expect(r.y + r.h, corner).toBeLessThanOrEqual(720)
        expect(r.w / r.h).toBeCloseTo(aspect)
        expect(r.x < 640).toBe(corner.endsWith('left'))
        expect(r.y < 300).toBe(corner.startsWith('top'))
      }
    }
  })

  it('keeps it a small corner: a tall phone video is limited by height', () => {
    const r = pipRect(1280, 720, 'top-right', 9 / 16, 0.38)
    expect(r.h).toBeLessThanOrEqual(720 * 0.45)
    expect(pipRect(1280, 720, 'top-right', 16 / 9, 0.2).w).toBeCloseTo(256)
  })

  it('gives the stage the frame below the title strip', () => {
    const a = stageArea(1280, 720)
    expect(a.y).toBeGreaterThan(0)
    expect(a.x + a.w).toBeLessThanOrEqual(1280)
    expect(a.y + a.h).toBeLessThanOrEqual(720)
  })
})

describe('export frame drawing', () => {
  const sample = createSampleProject()

  it('draws every dancer with their number', () => {
    const { ctx, calls, texts } = fakeContext()
    drawStage(ctx, sample, 0, stageArea(1280, 720), colors)
    expect(calls.filter((c) => c.name === 'arc')).toHaveLength(sample.dancers.length)
    for (const d of sample.dancers) expect(texts()).toContain(String(d.number))
  })

  it('leaves out dancers who are offstage', () => {
    const p = createSampleProject()
    p.formations[0].positions[p.dancers[0].id].present = false
    const { ctx, calls } = fakeContext()
    drawStage(ctx, p, 0, stageArea(1280, 720), colors)
    expect(calls.filter((c) => c.name === 'arc')).toHaveLength(p.dancers.length - 1)
  })

  it('titles the frame with the routine, the formation on stage and the time', () => {
    const held = fakeContext()
    drawHeader(held.ctx, sample, 500, 1280, 720, colors)
    expect(held.texts()).toEqual(['Sample routine', '·  Opening line', '0:00.5'])
    const moving = fakeContext()
    drawHeader(moving.ctx, sample, 3000, 1280, 720, colors)
    expect(moving.texts()[1]).toBe('·  Moving to Circle')
  })
})

describe('export length without a reference video', () => {
  it('runs to the end of the last formation’s hold, plus a beat', () => {
    expect(routineLength(createSampleProject())).toBe(20000 + 1500 + 2000)
    expect(routineLength({ formations: [] })).toBe(3000)
  })
})
