import type { Ms } from './model'

/** "m:ss.t" (tenths). Negative/NaN values render as 0. */
export function formatTime(ms: Ms, tenths = true): string {
  const safe = Number.isFinite(ms) && ms > 0 ? ms : 0
  const totalTenths = Math.floor(safe / 100)
  const t = totalTenths % 10
  const totalSec = Math.floor(totalTenths / 10)
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60)
  const base = `${m}:${String(s).padStart(2, '0')}`
  return tenths ? `${base}.${t}` : base
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Candidate spacings (seconds) for ruler ticks. */
const TICK_STEPS_SEC = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800]

/** Smallest step whose on-screen spacing is at least `minPx` pixels. */
export function chooseTickStep(pxPerSec: number, minPx = 80): number {
  for (const s of TICK_STEPS_SEC) if (s * pxPerSec >= minPx) return s
  return TICK_STEPS_SEC[TICK_STEPS_SEC.length - 1]
}

/** Common video frame rates; an estimate within 1.5% snaps to the exact value. */
const COMMON_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60]

export function snapFps(estimate: number): number {
  if (!Number.isFinite(estimate) || estimate <= 0) return 30
  // Pick the closest common rate (23.976 and 24 are only 0.1% apart, so first-match would be wrong).
  let best = COMMON_FPS[0]
  for (const f of COMMON_FPS) if (Math.abs(estimate - f) < Math.abs(estimate - best)) best = f
  if (Math.abs(estimate - best) / best < 0.015) return best
  return clamp(estimate, 1, 240)
}
