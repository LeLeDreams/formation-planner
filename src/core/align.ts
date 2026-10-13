import type { Vec2 } from './model'

export type Axis = 'x' | 'y'

export interface Item {
  id: string
  x: number
  y: number
}

/** Move every item to the min / middle / max of the group along `axis`. */
export function alignItems(items: Item[], axis: Axis, to: 'min' | 'mid' | 'max'): Record<string, Vec2> {
  const out: Record<string, Vec2> = {}
  if (items.length < 2) return out
  const vals = items.map((i) => i[axis])
  const lo = Math.min(...vals)
  const hi = Math.max(...vals)
  const target = to === 'min' ? lo : to === 'max' ? hi : (lo + hi) / 2
  for (const i of items) out[i.id] = axis === 'x' ? { x: target, y: i.y } : { x: i.x, y: target }
  return out
}

/** Spread items evenly along `axis`, keeping the two outermost where they are. */
export function distributeItems(items: Item[], axis: Axis): Record<string, Vec2> {
  const out: Record<string, Vec2> = {}
  if (items.length < 3) return out
  const sorted = [...items].sort((a, b) => a[axis] - b[axis] || a.id.localeCompare(b.id))
  const lo = sorted[0][axis]
  const hi = sorted[sorted.length - 1][axis]
  const step = (hi - lo) / (sorted.length - 1)
  sorted.forEach((it, k) => {
    const v = lo + step * k
    out[it.id] = axis === 'x' ? { x: v, y: it.y } : { x: it.x, y: v }
  })
  return out
}

export function centroid(items: Vec2[]): Vec2 {
  if (items.length === 0) return { x: 0, y: 0 }
  let x = 0
  let y = 0
  for (const i of items) {
    x += i.x
    y += i.y
  }
  return { x: x / items.length, y: y / items.length }
}

/** Rotate items around their centroid by `deg` (positive = clockwise on a y-down screen). */
export function rotateItems(items: Item[], deg: number): Record<string, Vec2> {
  const c = centroid(items)
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const out: Record<string, Vec2> = {}
  for (const i of items) {
    const dx = i.x - c.x
    const dy = i.y - c.y
    out[i.id] = { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
  }
  return out
}

/** Scale the spread of items around their centroid. */
export function scaleItems(items: Item[], factor: number): Record<string, Vec2> {
  const c = centroid(items)
  const out: Record<string, Vec2> = {}
  for (const i of items) out[i.id] = { x: c.x + (i.x - c.x) * factor, y: c.y + (i.y - c.y) * factor }
  return out
}
