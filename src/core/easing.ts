import type { EasingName } from './model'

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t)

const fns: Record<EasingName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  // Stay put until the end, then snap (useful for instant formation changes).
  hold: (t) => (t >= 1 ? 1 : 0),
}

export function ease(name: EasingName, t: number): number {
  return fns[name](clamp01(t))
}

export const EASING_LABELS: Record<EasingName, string> = {
  linear: 'Linear',
  easeInOut: 'Ease in-out',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  hold: 'Hold, then snap',
}
