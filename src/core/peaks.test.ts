import { describe, expect, it } from 'vitest'
import { chooseTickStep, clamp, formatTime, snapFps } from './time'
import { computePeaks, peaksToColumns } from './peaks'

describe('formatTime', () => {
  it('formats minutes, seconds and tenths', () => {
    expect(formatTime(0)).toBe('0:00.0')
    expect(formatTime(65_400)).toBe('1:05.4')
    expect(formatTime(600_000)).toBe('10:00.0')
  })
  it('can omit tenths', () => {
    expect(formatTime(65_400, false)).toBe('1:05')
  })
  it('treats negative and non-finite as zero', () => {
    expect(formatTime(-5)).toBe('0:00.0')
    expect(formatTime(NaN)).toBe('0:00.0')
  })
})

describe('time helpers', () => {
  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
  })
  it('picks a tick step that is far enough apart on screen', () => {
    expect(chooseTickStep(100)).toBe(1)
    expect(chooseTickStep(10)).toBe(10)
    for (const px of [2, 7, 40, 250, 900]) {
      expect(chooseTickStep(px) * px).toBeGreaterThanOrEqual(80)
    }
  })
  it('snaps frame rate estimates to common rates', () => {
    expect(snapFps(29.9)).toBe(29.97)
    expect(snapFps(24.1)).toBe(24)
    expect(snapFps(59.8)).toBe(59.94)
    expect(snapFps(0)).toBe(30)
    expect(snapFps(NaN)).toBe(30)
  })
})

describe('computePeaks', () => {
  it('finds min/max per bin and the normalization value', () => {
    // 100 samples/sec, 10 peaks/sec => 10 samples per peak
    const ch = new Float32Array(30)
    ch[3] = 0.5
    ch[14] = -0.8
    const p = computePeaks([ch], 100, 10)
    expect(p.max.length).toBe(3)
    expect(p.max[0]).toBeCloseTo(0.5)
    expect(p.min[1]).toBeCloseTo(-0.8)
    expect(p.norm).toBeCloseTo(0.8)
    expect(p.durationMs).toBeCloseTo(300)
  })
  it('merges channels by extremes', () => {
    const a = new Float32Array([0.1, 0, 0, 0])
    const b = new Float32Array([0, -0.4, 0, 0.9])
    const p = computePeaks([a, b], 4, 1)
    expect(p.max[0]).toBeCloseTo(0.9)
    expect(p.min[0]).toBeCloseTo(-0.4)
  })
  it('handles empty input', () => {
    const p = computePeaks([], 44100)
    expect(p.min.length).toBe(0)
    expect(p.durationMs).toBe(0)
  })
})

describe('peaksToColumns', () => {
  const ch = new Float32Array(100)
  ch[10] = 1
  ch[90] = -1
  const peaks = computePeaks([ch], 100, 100) // 1 sample per peak, 1s long

  it('reduces to the requested number of columns', () => {
    const cols = peaksToColumns(peaks, 0, 1000, 2)
    expect(cols.max[0]).toBeCloseTo(1)
    expect(cols.min[0]).toBeCloseTo(0)
    expect(cols.min[1]).toBeCloseTo(-1)
  })
  it('returns zeros past the end of the audio', () => {
    const cols = peaksToColumns(peaks, 5000, 6000, 4)
    expect(Array.from(cols.max)).toEqual([0, 0, 0, 0])
    expect(Array.from(cols.min)).toEqual([0, 0, 0, 0])
  })
  it('handles a window that starts before zero', () => {
    const cols = peaksToColumns(peaks, -500, 500, 2)
    expect(cols.max[0]).toBe(0)
    expect(cols.max[1]).toBeCloseTo(1)
  })
  it('handles degenerate ranges', () => {
    expect(peaksToColumns(peaks, 100, 100, 5).max).toHaveLength(5)
    expect(peaksToColumns(peaks, 0, 1000, 0).max).toHaveLength(0)
  })
})
