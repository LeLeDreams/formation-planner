import type { MediaRef } from '@/core/model'
import { DEFAULT_DURATION_MS, setPlayback, usePlaybackStore } from '@/store/playbackStore'
import { playhead } from '@/store/playheadStore'
import { useProjectStore } from '@/store/projectStore'
import { decodeWaveform } from './audio'
import { loadMedia, saveMedia } from './db'
import { hashFile } from './hash'
import { stopAll } from './transport'

/**
 * Keeps the active <video> in line with project.media.video. The project is the source of truth:
 * undo/redo, import, or loading a file all just change the project's MediaRef and this follows.
 */

/** Files picked this session, so switching back (undo) doesn't need IndexedDB. */
const cache = new Map<string, File>()
let token = 0
let currentUrl: string | null = null

const MEDIA_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|ogg|mp3|wav|m4a|aac|flac)$/i

export function looksLikeMedia(file: File): boolean {
  return file.type.startsWith('video/') || file.type.startsWith('audio/') || MEDIA_EXT.test(file.name)
}

export function describeMediaError(err: MediaError | null): string {
  switch (err?.code) {
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return 'This browser can’t play that video format. MP4 (H.264/AAC) and WebM work in every modern browser.'
    case MediaError.MEDIA_ERR_DECODE:
      return 'The video couldn’t be decoded. The file may be damaged or use an unsupported codec.'
    case MediaError.MEDIA_ERR_NETWORK:
      return 'The video file couldn’t be read. Try choosing it again.'
    default:
      return 'The video couldn’t be loaded.'
  }
}

/** Read duration from a detached element. Rejects with a friendly message for unplayable files. */
function probeMedia(url: string): Promise<{ durationMs: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    const timer = window.setTimeout(() => done(new Error('Timed out reading that file.')), 20_000)
    function done(err?: Error) {
      window.clearTimeout(timer)
      v.removeAttribute('src')
      v.load()
      if (err) reject(err)
    }
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      const d = v.duration
      if (!Number.isFinite(d) || d <= 0) return done(new Error('Couldn’t work out how long that video is.'))
      window.clearTimeout(timer)
      resolve({ durationMs: d * 1000 })
      v.removeAttribute('src')
      v.load()
    }
    v.onerror = () => done(new Error(describeMediaError(v.error)))
    v.src = url
  })
}

/** With no video, the timeline is 60s, or a little past the last formation if the routine is longer. */
function noVideoDuration(): number {
  const f = useProjectStore.getState().history.present.formations
  const last = f.length ? f[f.length - 1].timeMs + f[f.length - 1].holdMs : 0
  return Math.max(DEFAULT_DURATION_MS, Math.ceil((last + 8000) / 1000) * 1000)
}

function releaseVideo(): void {
  stopAll()
  if (currentUrl) URL.revokeObjectURL(currentUrl)
  currentUrl = null
}

function fallbackStatus(): 'ready' | 'missing' | 'none' {
  const s = usePlaybackStore.getState()
  return s.video ? 'ready' : s.missingRef ? 'missing' : 'none'
}

/** Choose a local video: validate, fingerprint, store it, and point the project at it. */
export async function loadVideoFile(file: File): Promise<void> {
  if (!looksLikeMedia(file)) {
    setPlayback({ mediaStatus: fallbackStatus(), mediaMessage: 'That doesn’t look like a video file. Try an MP4 or WebM.' })
    return
  }
  setPlayback({ mediaStatus: 'loading', mediaMessage: null })
  const probeUrl = URL.createObjectURL(file)
  let durationMs: number
  try {
    durationMs = (await probeMedia(probeUrl)).durationMs
  } catch (err) {
    setPlayback({ mediaStatus: fallbackStatus(), mediaMessage: err instanceof Error ? err.message : String(err) })
    return
  } finally {
    URL.revokeObjectURL(probeUrl)
  }
  const hash = await hashFile(file)
  cache.set(hash, file)
  setPlayback({ unstoredVideo: false })
  void saveMedia(hash, file).then((ok) => {
    if (!ok) {
      setPlayback({
        unstoredVideo: true,
        mediaMessage: 'The video is loaded, but couldn’t be saved on this device. You’ll need to choose it again next time.',
      })
    }
  })
  const ref: MediaRef = { hash, name: file.name, size: file.size, mimeType: file.type, durationMs }
  useProjectStore.getState().edit('Load video', (d) => {
    d.media.video = ref
  })
  await syncMedia()
}

export function removeVideo(): void {
  useProjectStore.getState().edit('Remove video', (d) => {
    delete d.media.video
  })
}

/** Make the active video match the project's MediaRef. Safe to call repeatedly. */
export async function syncMedia(): Promise<void> {
  const my = ++token
  const ref = useProjectStore.getState().history.present.media.video
  const pb = usePlaybackStore.getState()

  if (!ref) {
    releaseVideo()
    setPlayback({
      video: null,
      mediaStatus: 'none',
      mediaMessage: null,
      missingRef: null,
      peaks: null,
      peaksStatus: 'idle',
      peaksMessage: null,
      durationMs: noVideoDuration(),
    })
    return
  }
  if (pb.video?.hash === ref.hash) {
    setPlayback({ mediaStatus: 'ready' })
    return
  }

  setPlayback({ mediaStatus: 'loading', mediaMessage: null })
  const file = cache.get(ref.hash) ?? (await loadMedia(ref.hash))
  if (my !== token) return

  if (!file) {
    releaseVideo()
    setPlayback({
      video: null,
      mediaStatus: 'missing',
      missingRef: ref,
      peaks: null,
      peaksStatus: 'idle',
      durationMs: ref.durationMs ?? DEFAULT_DURATION_MS,
    })
    return
  }
  cache.set(ref.hash, file)

  releaseVideo()
  currentUrl = URL.createObjectURL(file)
  const durationMs = ref.durationMs ?? DEFAULT_DURATION_MS
  playhead.set(Math.min(playhead.get(), durationMs))
  setPlayback({
    video: { url: currentUrl, name: ref.name, hash: ref.hash },
    mediaStatus: 'ready',
    missingRef: null,
    durationMs,
    fps: 30,
    peaks: null,
    peaksStatus: 'loading',
    peaksMessage: null,
  })

  try {
    const peaks = await decodeWaveform(file)
    if (usePlaybackStore.getState().video?.hash === ref.hash) {
      setPlayback({ peaks, peaksStatus: 'ready' })
    }
  } catch (err) {
    if (usePlaybackStore.getState().video?.hash === ref.hash) {
      setPlayback({
        peaks: null,
        peaksStatus: 'unavailable',
        peaksMessage: err instanceof Error ? err.message : 'No waveform available.',
      })
    }
  }
}

/** Start following the project. Returns an unsubscribe function. */
export function startMediaSync(): () => void {
  const unsub = useProjectStore.subscribe((s, prev) => {
    const now = s.history.present
    const before = prev.history.present
    if (now.media.video?.hash !== before.media.video?.hash) void syncMedia()
    else if (!now.media.video && now.formations !== before.formations) {
      const d = noVideoDuration()
      if (d !== usePlaybackStore.getState().durationMs) setPlayback({ durationMs: d })
    }
  })
  void syncMedia()
  return unsub
}
