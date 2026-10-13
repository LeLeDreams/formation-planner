import type { Ms } from './model'

/** Min/max amplitude envelope of an audio track at a fixed resolution. */
export interface Peaks {
  peaksPerSec: number
  min: Float32Array
  max: Float32Array
  /** Largest absolute amplitude seen; used to normalize quiet recordings. */
  norm: number
  durationMs: Ms
}

/**
 * Build a peak envelope from decoded channel data. Channels are merged by taking the
 * extreme values across channels for each bin.
 */
export function computePeaks(
  channels: Float32Array[],
  sampleRate: number,
  peaksPerSec = 100,
): Peaks {
  const total = channels.length ? channels[0].length : 0
  const samplesPerPeak = sampleRate / peaksPerSec
  const n = Math.max(0, Math.ceil(total / samplesPerPeak))
  const min = new Float32Array(n)
  const max = new Float32Array(n)
  let norm = 0
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * samplesPerPeak)
    const end = Math.min(total, Math.max(start + 1, Math.floor((i + 1) * samplesPerPeak)))
    let lo = 0
    let hi = 0
    for (const ch of channels) {
      for (let j = start; j < end; j++) {
        const v = ch[j]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    min[i] = lo
    max[i] = hi
    const a = Math.max(-lo, hi)
    if (a > norm) norm = a
  }
  return { peaksPerSec, min, max, norm, durationMs: (total / sampleRate) * 1000 }
}

/**
 * Reduce a peak envelope to `columns` bars covering [startMs, endMs).
 * Columns outside the audio come back as 0.
 */
export function peaksToColumns(
  peaks: Peaks,
  startMs: Ms,
  endMs: Ms,
  columns: number,
): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(columns)
  const max = new Float32Array(columns)
  if (columns <= 0 || endMs <= startMs || peaks.min.length === 0) return { min, max }
  const msPerCol = (endMs - startMs) / columns
  const last = peaks.min.length - 1
  for (let c = 0; c < columns; c++) {
    const a = Math.floor(((startMs + c * msPerCol) / 1000) * peaks.peaksPerSec)
    const b = Math.max(a + 1, Math.floor(((startMs + (c + 1) * msPerCol) / 1000) * peaks.peaksPerSec))
    if (b <= 0 || a > last) continue
    let lo = 0
    let hi = 0
    for (let i = Math.max(0, a); i < b && i <= last; i++) {
      if (peaks.min[i] < lo) lo = peaks.min[i]
      if (peaks.max[i] > hi) hi = peaks.max[i]
    }
    min[c] = lo
    max[c] = hi
  }
  return { min, max }
}
