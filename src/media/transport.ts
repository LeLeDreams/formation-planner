import type { Ms } from '@/core/model'
import { clamp, snapFps } from '@/core/time'
import { setPlayback, usePlaybackStore, type LoopRegion } from '@/store/playbackStore'
import { playhead } from '@/store/playheadStore'

/**
 * Playback controller. The <video> element is the master clock when a video is loaded (so its
 * audio is always in sync); otherwise a requestAnimationFrame clock drives the playhead.
 * The playhead is pushed to playheadStore imperatively, never through React state.
 */

let el: HTMLVideoElement | null = null
let raf = 0
let lastNow = 0
let detach: (() => void) | null = null

const state = () => usePlaybackStore.getState()

/** The element, when it has a video loaded far enough to be seeked and played. */
function activeVideo(): HTMLVideoElement | null {
  return el !== null && state().video !== null && el.readyState >= 1 ? el : null
}

function startTick(): void {
  if (raf) return
  lastNow = performance.now()
  raf = requestAnimationFrame(tick)
}

function stopTick(): void {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
}

function tick(now: number): void {
  raf = 0
  const s = state()
  if (!s.playing) return
  const v = activeVideo()
  let t: Ms
  if (v) {
    t = v.currentTime * 1000
  } else {
    t = playhead.get() + (now - lastNow) * s.rate
  }
  lastNow = now

  const loop = s.loop
  if (s.loopEnabled && loop && loop.endMs > loop.startMs && t >= loop.endMs) {
    seek(loop.startMs)
    raf = requestAnimationFrame(tick)
    return
  }
  if (!v && t >= s.durationMs) {
    playhead.set(s.durationMs)
    setPlayback({ playing: false })
    return
  }
  playhead.set(t)
  raf = requestAnimationFrame(tick)
}

/** Connect (or disconnect, with null) the <video> element. Called by the VideoPlayer component. */
export function attach(video: HTMLVideoElement | null): void {
  if (el === video) return
  detach?.()
  detach = null
  el = video
  if (!video) return

  const onPlay = () => {
    setPlayback({ playing: true })
    startTick()
  }
  const onPause = () => {
    stopTick()
    setPlayback({ playing: false })
    playhead.set(video.currentTime * 1000)
  }
  const onSeeked = () => playhead.set(video.currentTime * 1000)
  const onMeta = () => {
    const s = state()
    video.playbackRate = s.rate
    video.muted = s.muted
    video.volume = s.volume
    if (Number.isFinite(video.duration) && video.duration > 0) {
      setPlayback({ durationMs: video.duration * 1000 })
    }
    // Keep the playhead where it was when a video is swapped in.
    const at = clamp(playhead.get() / 1000, 0, Number.isFinite(video.duration) ? video.duration : 0)
    if (Math.abs(video.currentTime - at) > 0.01) video.currentTime = at
  }
  video.addEventListener('play', onPlay)
  video.addEventListener('pause', onPause)
  video.addEventListener('ended', onPause)
  video.addEventListener('seeked', onSeeked)
  video.addEventListener('loadedmetadata', onMeta)

  // Estimate the frame rate (for frame-stepping) from presented frames.
  let frameCb = 0
  let last: { t: number; n: number } | null = null
  const samples: number[] = []
  const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
    if (last && meta.presentedFrames > last.n && meta.mediaTime > last.t) {
      samples.push((meta.presentedFrames - last.n) / (meta.mediaTime - last.t))
      if (samples.length >= 30) {
        samples.sort((a, b) => a - b)
        setPlayback({ fps: snapFps(samples[samples.length >> 1]) })
        samples.length = 0
      }
    }
    last = { t: meta.mediaTime, n: meta.presentedFrames }
    frameCb = video.requestVideoFrameCallback(onFrame)
  }
  if ('requestVideoFrameCallback' in video) frameCb = video.requestVideoFrameCallback(onFrame)

  detach = () => {
    video.removeEventListener('play', onPlay)
    video.removeEventListener('pause', onPause)
    video.removeEventListener('ended', onPause)
    video.removeEventListener('seeked', onSeeked)
    video.removeEventListener('loadedmetadata', onMeta)
    if (frameCb && 'cancelVideoFrameCallback' in video) video.cancelVideoFrameCallback(frameCb)
  }
}

export function seek(ms: Ms): void {
  const t = clamp(ms, 0, state().durationMs)
  playhead.set(t)
  const v = activeVideo()
  if (v) {
    const max = Number.isFinite(v.duration) ? v.duration : t / 1000
    v.currentTime = Math.min(t / 1000, max)
  }
}

export function play(): void {
  const s = state()
  if (playhead.get() >= s.durationMs - 50) seek(0)
  const v = activeVideo()
  if (v) {
    v.play().catch((err) => console.warn('Playback was blocked', err))
  } else {
    setPlayback({ playing: true })
    startTick()
  }
}

export function pause(): void {
  const v = activeVideo()
  if (v) {
    v.pause()
  } else {
    stopTick()
    setPlayback({ playing: false })
  }
}

export function toggle(): void {
  if (state().playing) pause()
  else play()
}

/** Stop everything (used when the video is removed). */
export function stopAll(): void {
  stopTick()
  el?.pause()
  setPlayback({ playing: false })
}

/** Step by whole frames (negative = backward). Lands in the middle of a frame so the right one shows. */
export function step(frames: number): void {
  pause()
  const fps = state().fps
  const idx = Math.floor((playhead.get() / 1000) * fps + 1e-6) + frames
  seek(((Math.max(0, idx) + 0.5) / fps) * 1000)
}

export function nudge(seconds: number): void {
  seek(playhead.get() + seconds * 1000)
}

export function setRate(rate: number): void {
  const r = clamp(rate, 0.25, 2)
  setPlayback({ rate: r })
  if (el) el.playbackRate = r
}

export function setMuted(muted: boolean): void {
  // Unmuting at zero volume would still be silent, so bring the volume back up.
  if (!muted && state().volume === 0) {
    setVolume(0.6)
    return
  }
  setPlayback({ muted })
  if (el) el.muted = muted
}

export function toggleMute(): void {
  setMuted(!state().muted)
}

export function setVolume(volume: number): void {
  const v = clamp(volume, 0, 1)
  setPlayback({ volume: v, muted: v === 0 ? true : false })
  if (el) {
    el.volume = v
    el.muted = v === 0
  }
}

/* ---------------- looping a section ---------------- */

export function setLoop(loop: LoopRegion | null): void {
  if (!loop) {
    setPlayback({ loop: null, loopEnabled: false })
    return
  }
  const d = state().durationMs
  const startMs = clamp(Math.min(loop.startMs, loop.endMs), 0, d)
  const endMs = clamp(Math.max(loop.startMs, loop.endMs), 0, d)
  setPlayback({ loop: endMs - startMs >= 100 ? { startMs, endMs } : null, loopEnabled: endMs - startMs >= 100 })
}

export function setLoopStart(t: Ms = playhead.get()): void {
  const { loop, durationMs } = state()
  const end = loop && loop.endMs > t ? loop.endMs : durationMs
  setLoop({ startMs: t, endMs: end })
}

export function setLoopEnd(t: Ms = playhead.get()): void {
  const { loop } = state()
  const start = loop && loop.startMs < t ? loop.startMs : 0
  setLoop({ startMs: start, endMs: t })
}

export function toggleLoop(): void {
  const { loop, loopEnabled } = state()
  if (!loop) return
  setPlayback({ loopEnabled: !loopEnabled })
}
