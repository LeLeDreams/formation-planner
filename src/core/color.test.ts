import { describe, expect, it } from 'vitest'
import { DANCER_COLORS } from './model'
import { DARK_INK, readableInk, relativeLuminance } from './color'

describe('color', () => {
  it('computes luminance extremes', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1)
  })
  it('returns 0 for invalid input instead of throwing', () => {
    expect(relativeLuminance('nope')).toBe(0)
  })
  it('uses dark ink on every pastel dancer color', () => {
    for (const c of DANCER_COLORS) expect(readableInk(c)).toBe(DARK_INK)
  })
  it('uses white ink on dark fills', () => {
    expect(readableInk('#1a1a40')).toBe('#ffffff')
  })
})
