import type { Vec2 } from './model'
import type { Bounds } from './stage'

export type ArrangeKind = 'line' | 'circle' | 'arc' | 'v' | 'diagonal' | 'block'

export const ARRANGE_LABELS: Record<ArrangeKind, string> = {
  line: 'Line',
  circle: 'Circle',
  arc: 'Arc',
  v: 'V shape',
  diagonal: 'Diagonal',
  block: 'Block / rows',
}

export interface Item extends Vec2 {
  id: string
}

export interface Layout {
  /** Slots centered on the origin. */
  slots: Vec2[]
  /** For blocks: how many slots are in each row (row-major order). */
  rowSizes?: number[]
}

const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

/** Comfortable default gap between dancers, given the crowding threshold. */
export const defaultSpacing = (minDistance: number): number => Math.max(3, minDistance * 1.5)

function recenter(slots: Vec2[]): Vec2[] {
  if (!slots.length) return slots
  const cx = slots.reduce((a, s) => a + s.x, 0) / slots.length
  const cy = slots.reduce((a, s) => a + s.y, 0) / slots.length
  return slots.map((s) => ({ x: s.x - cx, y: s.y - cy }))
}

/**
 * Slot positions for `n` dancers in a shape, centered on the origin. +y is toward the audience:
 * the V points at the audience and the arc bulges toward it.
 */
export function layout(kind: ArrangeKind, n: number, spacing: number): Layout {
  if (n <= 0) return { slots: [] }
  if (n === 1) return { slots: [{ x: 0, y: 0 }] }
  const mid = (n - 1) / 2
  switch (kind) {
    case 'line':
      return { slots: range(n).map((i) => ({ x: (i - mid) * spacing, y: 0 })) }
    case 'diagonal': {
      const s = spacing * 0.8
      return { slots: range(n).map((i) => ({ x: (i - mid) * s, y: (i - mid) * s })) }
    }
    case 'v': {
      const d = spacing * 0.8
      return { slots: recenter(range(n).map((i) => ({ x: (i - mid) * d, y: (mid - Math.abs(i - mid)) * d }))) }
    }
    case 'circle': {
      // Chord between neighbors is 2·r·sin(π/n); make it at least `spacing`.
      const r = Math.max(spacing / (2 * Math.sin(Math.PI / n)), spacing)
      return {
        slots: range(n).map((i) => {
          const a = (2 * Math.PI * i) / n
          return { x: r * Math.sin(a), y: r * Math.cos(a) }
        }),
      }
    }
    case 'arc': {
      const span = (140 * Math.PI) / 180
      const r = (spacing * (n - 1)) / span
      return {
        slots: recenter(
          range(n).map((i) => {
            const a = -span / 2 + (i * span) / (n - 1)
            return { x: r * Math.sin(a), y: r * Math.cos(a) }
          }),
        ),
      }
    }
    case 'block': {
      const rows0 = Math.max(1, Math.round(Math.sqrt(n / 1.6)))
      const cols = Math.ceil(n / rows0)
      const rows = Math.ceil(n / cols)
      const rowSizes: number[] = []
      const slots: Vec2[] = []
      for (let r = 0; r < rows; r++) {
        const size = Math.min(cols, n - r * cols)
        rowSizes.push(size)
        for (let c = 0; c < size; c++) {
          slots.push({ x: (c - (size - 1) / 2) * spacing, y: (r - (rows - 1) / 2) * spacing })
        }
      }
      return { slots, rowSizes }
    }
  }
}

const byXY = (a: Vec2, b: Vec2): number => a.x - b.x || a.y - b.y

const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Match dancers to slots so paths cross as little as possible. */
export function assignSlots(
  kind: ArrangeKind,
  items: Item[],
  slots: Vec2[],
  center: Vec2,
  rowSizes?: number[],
): Record<string, Vec2> {
  const out: Record<string, Vec2> = {}
  if (kind === 'block' && rowSizes) {
    const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
    let k = 0
    for (const size of rowSizes) {
      const chunk = sorted.slice(k, k + size).sort(byXY)
      const rowSlots = slots.slice(k, k + size)
      chunk.forEach((it, i) => (out[it.id] = rowSlots[i]))
      k += size
    }
    return out
  }
  if (kind === 'circle') {
    const ang = (p: Vec2) => Math.atan2(p.y - center.y, p.x - center.x)
    const si = [...items].sort((a, b) => ang(a) - ang(b))
    const ss = [...slots].sort((a, b) => ang(a) - ang(b))
    const n = si.length
    let bestRot = 0
    let bestCost = Infinity
    // Rotate the ring so the total travel distance is smallest.
    for (let rot = 0; rot < n; rot++) {
      let cost = 0
      for (let i = 0; i < n; i++) cost += dist(si[i], ss[(i + rot) % n])
      if (cost < bestCost) {
        bestCost = cost
        bestRot = rot
      }
    }
    si.forEach((it, i) => (out[it.id] = ss[(i + bestRot) % n]))
    return out
  }
  const si = [...items].sort(byXY)
  const ss = [...slots].sort(byXY)
  si.forEach((it, i) => (out[it.id] = ss[i]))
  return out
}

export interface ArrangeOptions {
  spacing: number
  /** Center of the new shape; defaults to the centroid of the items. */
  center?: Vec2
  /** Keep the shape inside these bounds (shrinks, then shifts, then clamps). */
  bounds?: Bounds
}

export function centroid(items: Vec2[]): Vec2 {
  if (!items.length) return { x: 0, y: 0 }
  return {
    x: items.reduce((a, p) => a + p.x, 0) / items.length,
    y: items.reduce((a, p) => a + p.y, 0) / items.length,
  }
}

/** Arrange dancers into a shape. Returns the new position for each id. */
export function arrange(kind: ArrangeKind, items: Item[], opts: ArrangeOptions): Record<string, Vec2> {
  if (!items.length) return {}
  const c = opts.center ?? centroid(items)
  let { slots, rowSizes } = layout(kind, items.length, opts.spacing)

  const b = opts.bounds
  if (b && slots.length > 1) {
    // Shrink the shape if it is wider/deeper than the space, leaving a 1-unit margin.
    const w = Math.max(...slots.map((s) => s.x)) - Math.min(...slots.map((s) => s.x))
    const h = Math.max(...slots.map((s) => s.y)) - Math.min(...slots.map((s) => s.y))
    const f = Math.min(1, w > 0 ? (b.maxX - b.minX - 2) / w : 1, h > 0 ? (b.maxY - b.minY - 2) / h : 1)
    if (f > 0 && f < 1) slots = slots.map((s) => ({ x: s.x * f, y: s.y * f }))
  }
  let final = slots.map((s) => ({ x: s.x + c.x, y: s.y + c.y }))

  if (b) {
    const minX = Math.min(...final.map((p) => p.x))
    const maxX = Math.max(...final.map((p) => p.x))
    const minY = Math.min(...final.map((p) => p.y))
    const maxY = Math.max(...final.map((p) => p.y))
    let dx = 0
    let dy = 0
    if (minX < b.minX + 1) dx = b.minX + 1 - minX
    else if (maxX > b.maxX - 1) dx = b.maxX - 1 - maxX
    if (minY < b.minY + 1) dy = b.minY + 1 - minY
    else if (maxY > b.maxY - 1) dy = b.maxY - 1 - maxY
    final = final.map((p) => ({
      x: Math.min(b.maxX - 1, Math.max(b.minX + 1, p.x + dx)),
      y: Math.min(b.maxY - 1, Math.max(b.minY + 1, p.y + dy)),
    }))
  }
  return assignSlots(kind, items, final, c, rowSizes)
}

/* ---------------- align / distribute / transform ---------------- */

/** Alignment in a frame where +x is right and +y is down (i.e. the on-screen view). */
export type AlignKind = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom'

export function align(items: Item[], kind: AlignKind): Record<string, Vec2> {
  const out: Record<string, Vec2> = {}
  if (!items.length) return out
  const minX = Math.min(...items.map((i) => i.x))
  const maxX = Math.max(...items.map((i) => i.x))
  const minY = Math.min(...items.map((i) => i.y))
  const maxY = Math.max(...items.map((i) => i.y))
  for (const it of items) {
    const p = { x: it.x, y: it.y }
    if (kind === 'left') p.x = minX
    else if (kind === 'right') p.x = maxX
    else if (kind === 'centerX') p.x = (minX + maxX) / 2
    else if (kind === 'top') p.y = minY
    else if (kind === 'bottom') p.y = maxY
    else p.y = (minY + maxY) / 2
    out[it.id] = p
  }
  return out
}

/** Even spacing between the outermost two dancers along an axis. Needs 3+ dancers. */
export function distribute(items: Item[], axis: 'x' | 'y'): Record<string, Vec2> {
  const out: Record<string, Vec2> = {}
  for (const it of items) out[it.id] = { x: it.x, y: it.y }
  if (items.length < 3) return out
  const sorted = [...items].sort((a, b) => a[axis] - b[axis])
  const first = sorted[0][axis]
  const last = sorted[sorted.length - 1][axis]
  const step = (last - first) / (sorted.length - 1)
  sorted.forEach((it, i) => {
    out[it.id] = { ...out[it.id], [axis]: first + step * i }
  })
  return out
}

/** Rotate (degrees, clockwise) and scale a group of points about their centroid. */
export function transformGroup(
  items: Item[],
  t: { rotateDeg?: number; scale?: number },
): Record<string, Vec2> {
  const out: Record<string, Vec2> = {}
  const c = centroid(items)
  const r = ((t.rotateDeg ?? 0) * Math.PI) / 180
  const s = t.scale ?? 1
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  for (const it of items) {
    const dx = (it.x - c.x) * s
    const dy = (it.y - c.y) * s
    out[it.id] = { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
  }
  return out
}
