import type { Vec2 } from './model'

export interface SnapGuide {
  axis: 'x' | 'y'
  /** Stage coordinate the guide line sits on. */
  value: number
}

export interface SnapOptions {
  /** Grid size in stage units, or null to disable grid snapping. */
  grid: number | null
  /** Positions of other dancers to align with. */
  targets: Vec2[]
  /** Max distance (stage units) at which a guide captures the point. */
  threshold: number
  /** Smart guides: align to the center line and to other dancers. */
  guides: boolean
}

export interface SnapResult extends Vec2 {
  guides: SnapGuide[]
}

export function snapToGrid(v: number, grid: number): number {
  const s = Math.round(v / grid) * grid
  return s === 0 ? 0 : Number(s.toFixed(6))
}

/**
 * Snap a point. Smart guides win over the grid on an axis when one is within `threshold`;
 * otherwise the grid is used. Each axis is independent.
 */
export function snapPoint(p: Vec2, o: SnapOptions): SnapResult {
  const out: Vec2 = { x: p.x, y: p.y }
  const guides: SnapGuide[] = []
  for (const axis of ['x', 'y'] as const) {
    let best: number | null = null
    let bestD = o.threshold
    if (o.guides) {
      // 0 is the center line on that axis.
      const candidates = [0, ...o.targets.map((t) => t[axis])]
      for (const c of candidates) {
        const d = Math.abs(c - p[axis])
        if (d <= bestD) {
          bestD = d
          best = c
        }
      }
    }
    if (best !== null) {
      out[axis] = best
      guides.push({ axis, value: best })
    } else if (o.grid && o.grid > 0) {
      out[axis] = snapToGrid(p[axis], o.grid)
    }
  }
  return { ...out, guides }
}
