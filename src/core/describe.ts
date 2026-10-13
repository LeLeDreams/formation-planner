import type { Units } from './model'

const fmt = (n: number): string => {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1)
}

/**
 * Plain-language position relative to the center of the stage, from the performer's point of view:
 * +x is the audience's right, which is the performer's (stage) left; +y is downstage, toward the audience.
 */
export function describePosition(x: number, y: number, units: Units, onStage = true): string {
  if (!onStage) return 'Offstage'
  const parts: string[] = []
  if (Math.abs(x) >= 0.05) parts.push(`${fmt(Math.abs(x))} ${units} stage ${x > 0 ? 'left' : 'right'}`)
  if (Math.abs(y) >= 0.05) parts.push(`${fmt(Math.abs(y))} ${units} ${y > 0 ? 'downstage' : 'upstage'}`)
  return parts.length ? `${parts.join(', ')} of center` : 'Center stage'
}
