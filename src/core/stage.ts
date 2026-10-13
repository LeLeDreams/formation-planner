import type { AudienceSide, StageConfig, Vec2 } from './model'

/**
 * Stage coordinates: origin at stage center, +x toward the audience's right, +y toward the audience.
 * `facing` is degrees clockwise as seen from above, 0 = facing the audience.
 *
 * The on-screen "view" rotates the stage so the audience edge sits on the configured side.
 * Rotating (not mirroring) keeps left/right consistent, and positive angles stay clockwise.
 */
export const VIEW_ROT: Record<AudienceSide, number> = { bottom: 0, left: 90, top: 180, right: -90 }

export function rotate(p: Vec2, deg: number): Vec2 {
  const r = (deg * Math.PI) / 180
  const c = Math.cos(r)
  const s = Math.sin(r)
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c }
}

const clean = (n: number): number => (Math.abs(n) < 1e-9 ? 0 : n)

export function toView(p: Vec2, side: AudienceSide): Vec2 {
  const r = rotate(p, VIEW_ROT[side])
  return { x: clean(r.x), y: clean(r.y) }
}

export function fromView(p: Vec2, side: AudienceSide): Vec2 {
  const r = rotate(p, -VIEW_ROT[side])
  return { x: clean(r.x), y: clean(r.y) }
}

export interface Bounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/** The dance floor itself. */
export function floorBounds(stage: Pick<StageConfig, 'width' | 'depth'>): Bounds {
  return { minX: -stage.width / 2, maxX: stage.width / 2, minY: -stage.depth / 2, maxY: stage.depth / 2 }
}

/** Floor plus the wings on each side: everywhere a dancer marker may be placed. */
export function reachBounds(stage: Pick<StageConfig, 'width' | 'depth' | 'wingDepth'>): Bounds {
  const f = floorBounds(stage)
  return { ...f, minX: f.minX - stage.wingDepth, maxX: f.maxX + stage.wingDepth }
}

export function clampPoint(p: Vec2, b: Bounds, margin = 0): Vec2 {
  return {
    x: Math.min(b.maxX - margin, Math.max(b.minX + margin, p.x)),
    y: Math.min(b.maxY - margin, Math.max(b.minY + margin, p.y)),
  }
}

/** On-screen width/height of floor + wings, in stage units, after the view rotation. */
export function viewExtent(stage: Pick<StageConfig, 'width' | 'depth' | 'wingDepth' | 'audienceSide'>): {
  w: number
  h: number
} {
  const w = stage.width + stage.wingDepth * 2
  const h = stage.depth
  return stage.audienceSide === 'left' || stage.audienceSide === 'right' ? { w: h, h: w } : { w, h }
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/** Facing angle (degrees) that points a dancer at `to`. */
export function facingToward(from: Vec2, to: Vec2): number {
  const vx = to.x - from.x
  const vy = to.y - from.y
  if (Math.abs(vx) < 1e-9 && Math.abs(vy) < 1e-9) return 0
  const deg = (Math.atan2(-vx, vy) * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

/** Normalize an angle to [0, 360). */
export const normAngle = (deg: number): number => ((deg % 360) + 360) % 360
