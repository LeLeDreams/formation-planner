import { create } from 'zustand'
import type { MediaRef, Ms } from '@/core/model'
import type { Peaks } from '@/core/peaks'

export type MediaStatus = 'none' | 'loading' | 'ready' | 'missing' | 'error'
export type PeaksStatus = 'idle' | 'loading' | 'ready' | 'unavailable'

export interface LoopRegion {
  startMs: Ms
  endMs: Ms
}

export const DEFAULT_DURATION_MS = 60_000
export const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const

/**
 * Low-frequency playback/media state. The per-frame playhead lives in playheadStore, NOT here,
 * so playback never re-renders React.
 */
interface PlaybackState {
  playing: boolean
  rate: number
  muted: boolean
  volume: number
  /** Length of the timeline: the video's duration, or a default when no video is loaded. */
  durationMs: Ms
  loop: LoopRegion | null
  loopEnabled: boolean

  /** Active video (object URL) or null. */
  video: { url: string; name: string; hash: string } | null
  mediaStatus: MediaStatus
  mediaMessage: string | null
  /** Set when the project references a video that isn't stored on this device. */
  missingRef: MediaRef | null
  peaks: Peaks | null
  peaksStatus: PeaksStatus
  peaksMessage: string | null
  fps: number
  /** The video is only in memory: it couldn't be saved on this device, so a reload would lose it. */
  unstoredVideo: boolean
}

export const usePlaybackStore = create<PlaybackState>(() => ({
  playing: false,
  rate: 1,
  muted: false,
  volume: 1,
  durationMs: DEFAULT_DURATION_MS,
  loop: null,
  loopEnabled: false,
  video: null,
  mediaStatus: 'none',
  mediaMessage: null,
  missingRef: null,
  peaks: null,
  peaksStatus: 'idle',
  peaksMessage: null,
  fps: 30,
  unstoredVideo: false,
}))

export const setPlayback = usePlaybackStore.setState
