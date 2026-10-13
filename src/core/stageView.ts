import type { AudienceSide, StageConfig, Vec2 } from './model'

/**
 * Stage world coordinates: origin at stage center, +y toward the audience (downstage), in stage units.
 * Screen coordinates: pixels, y down. The audience side decides how the world is rotated on screen
 * so the audience is always at the configured edge. All maps here are rigid rotations.
 */

export interface View {
  /** Pixels per stage unit. */
  scale: number
  /** Screen position of the world origin. */
  originX: number
  originY: number
  side: AudienceSide
}

export function rotateToScreen(side: AudienceSide, x: number, y: number): Vec2 {
  switch (side) {
    case 'bottom':
      return { x, y }
    case 'top':
      return { x: -x, y: -y }
    case 'right':
      return { x: y, y: -x }
    case 'left':
      return { x: -y, y: x }
  }
}

export function rotateFromScreen(side: AudienceSide, sx: number, sy: number): Vec2 {
  switch (side) {
    case 'bottom':
      return { x: sx, y: sy }
    case 'top':
      return { x: -sx, y: -sy }
    case 'right':
      return { x: -sy, y: sx }
    case 'left':
      return { x: sy, y: -sx }
  }
}

export function worldToScreen(view: View, p: Vec2): Vec2 {
  const r = rotateToScreen(view.side, p.x, p.y)
  return { x: view.originX + r.x * view.scale, y: view.originY + r.y * view.scale }
}

export function screenToWorld(view: View, s: Vec2): Vec2 {
  return rotateFromScreen(view.side, (s.x - view.originX) / view.scale, (s.y - view.originY) / view.scale)
}

/** Whole-stage extent on screen, in stage units (wings included). */
export function screenExtent(stage: StageConfig): { w: number; h: number } {
  const wx = stage.width + 2 * stage.wingDepth
  const wy = stage.depth
  return stage.audienceSide === 'left' || stage.audienceSide === 'right' ? { w: wy, h: wx } : { w: wx, h: wy }
}

/** Scale that fits the stage (plus wings) into a w x h box with a pixel margin. */
export function fitScale(stage: StageConfig, w: number, h: number, margin = 36): number {
  const e = screenExtent(stage)
  const s = Math.min((w - 2 * margin) / e.w, (h - 2 * margin) / e.h)
  return Number.isFinite(s) && s > 0.5 ? s : 0.5
}

/** Where dancers may stand: the stage plus wings, inset by `pad`. */
export function stageBounds(stage: StageConfig, pad = 0): { minX: number; maxX: number; minY: number; maxY: number } {
  const hx = stage.width / 2 + stage.wingDepth - pad
  const hy = stage.depth / 2 - pad
  return { minX: -hx, maxX: hx, minY: -hy, maxY: hy }
}

export const clampNum = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function clampToStage(stage: StageConfig, p: Vec2, pad = 0.5): Vec2 {
  const b = stageBounds(stage, pad)
  return { x: clampNum(p.x, b.minX, b.maxX), y: clampNum(p.y, b.minY, b.maxY) }
}

/**
 * Limit a group translation so every member stays inside the stage, keeping the shape intact.
 */
export function clampDelta(stage: StageConfig, starts: Vec2[], d: Vec2, pad = 0.5): Vec2 {
  if (starts.length === 0) return d
  const b = stageBounds(stage, pad)
  let lowX = -Infinity
  let highX = Infinity
  let lowY = -Infinity
  let highY = Infinity
  for (const s of starts) {
    lowX = Math.max(lowX, b.minX - s.x)
    highX = Math.min(highX, b.maxX - s.x)
    lowY = Math.max(lowY, b.minY - s.y)
    highY = Math.min(highY, b.maxY - s.y)
  }
  return {
    x: lowX > highX ? 0 : clampNum(d.x, lowX, highX),
    y: lowY > highY ? 0 : clampNum(d.y, lowY, highY),
  }
}

/**
 * Facing is stored in degrees: 0 faces the audience, 90 faces stage-left-of-audience-down view
 * (clockwise when viewed with the audience at the bottom). Returns the Konva rotation (clockwise
 * degrees, 0 = pointing down the screen) for an indicator drawn pointing along +y.
 */
export function facingToScreenAngle(side: AudienceSide, facing: number): number {
  const rad = (facing * Math.PI) / 180
  const d = rotateToScreen(side, -Math.sin(rad), Math.cos(rad))
  return (Math.atan2(-d.x, d.y) * 180) / Math.PI
}

/**
 * Which world axis and end a screen direction corresponds to, so "align left" can work for any
 * audience side.
 */
export function screenDirToWorld(
  side: AudienceSide,
  dir: 'left' | 'right' | 'up' | 'down',
): { axis: 'x' | 'y'; extreme: 'min' | 'max' } {
  const sv = dir === 'left' ? { x: -1, y: 0 } : dir === 'right' ? { x: 1, y: 0 } : dir === 'up' ? { x: 0, y: -1 } : { x: 0, y: 1 }
  const w = rotateFromScreen(side, sv.x, sv.y)
  return Math.abs(w.x) > 0.5
    ? { axis: 'x', extreme: w.x > 0 ? 'max' : 'min' }
    : { axis: 'y', extreme: w.y > 0 ? 'max' : 'min' }
}

/** Which world axis runs horizontally / vertically on screen. */
export function horizontalAxis(side: AudienceSide): 'x' | 'y' {
  return side === 'left' || side === 'right' ? 'y' : 'x'
}
