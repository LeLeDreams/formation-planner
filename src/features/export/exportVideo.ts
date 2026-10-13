import type { Ms, Project } from '@/core/model'
import { drawHeader, drawPip, drawStage, pipRect, stageArea, type Corner, type FrameColors } from './drawFrame'

/**
 * Records the routine as a video file: the stage animation, with the reference video (and its
 * sound) picture-in-picture in a corner. It is recorded in real time with the browser's own
 * recorder, so a three-minute routine takes three minutes.
 */

export interface ExportFormat {
  mimeType: string
  extension: 'mp4' | 'webm'
  label: string
}

const CANDIDATES: ExportFormat[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4' },
  { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm', label: 'WebM' },
  { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
]

/** The video formats this browser can record, best first (one entry per file type). */
export function supportedFormats(): ExportFormat[] {
  if (typeof MediaRecorder === 'undefined') return []
  const out: ExportFormat[] = []
  for (const c of CANDIDATES) {
    if (!out.some((o) => o.extension === c.extension) && MediaRecorder.isTypeSupported(c.mimeType)) out.push(c)
  }
  return out
}

export const canExportVideo = (): boolean =>
  supportedFormats().length > 0 && typeof HTMLCanvasElement.prototype.captureStream === 'function'

/** How long the export runs when there is no reference video: to the end of the last formation, plus a beat. */
export function routineLength(project: Pick<Project, 'formations'>): Ms {
  const last = project.formations[project.formations.length - 1]
  return Math.max(3000, last ? last.timeMs + last.holdMs + 2000 : 0)
}

export interface ExportOptions {
  project: Project
  /** Object URL of the reference video, if there is one. */
  videoUrl: string | null
  /** Where the reference video sits, or null to leave it out (its sound is still included). */
  corner: Corner | null
  /** Width of the reference video as a fraction of the frame. */
  pipSize: number
  mirrored: boolean
  width: number
  height: number
  format: ExportFormat
  colors: FrameColors
  /** Stop after this long instead of at the end of the video. */
  durationMs?: Ms
  onProgress?: (doneMs: Ms, totalMs: Ms) => void
  signal?: AbortSignal
}

/**
 * Calls `fn` about 30 times a second, and keeps doing so when the tab is in the background
 * (where the browser slows `requestAnimationFrame` and ordinary timers to a crawl). Returns a stop function.
 */
function startFrameClock(fn: () => void): () => void {
  try {
    const src = URL.createObjectURL(new Blob(['setInterval(() => postMessage(0), 1000 / 30)'], { type: 'text/javascript' }))
    const worker = new Worker(src)
    worker.onmessage = fn
    return () => {
      worker.terminate()
      URL.revokeObjectURL(src)
    }
  } catch {
    const id = window.setInterval(fn, 1000 / 30)
    return () => window.clearInterval(id)
  }
}

export class ExportCancelled extends Error {
  constructor() {
    super('Export cancelled')
    this.name = 'ExportCancelled'
  }
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'auto'
    v.playsInline = true
    v.onloadeddata = () => resolve(v)
    v.onerror = () => reject(new Error('The reference video couldn’t be read for the export.'))
    v.src = url
  })
}

export async function exportRoutineVideo(o: ExportOptions): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = o.width
  canvas.height = o.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('This browser can’t draw the export.')

  const video = o.videoUrl ? await loadVideo(o.videoUrl) : null
  const hasPicture = !!video && video.videoWidth > 0
  const total = o.durationMs ?? (video && Number.isFinite(video.duration) ? video.duration * 1000 : routineLength(o.project))
  const area = stageArea(o.width, o.height)
  const pip =
    video && hasPicture && o.corner
      ? pipRect(o.width, o.height, o.corner, video.videoWidth / video.videoHeight, o.pipSize)
      : null

  const draw = (t: Ms) => {
    ctx.fillStyle = o.colors.background
    ctx.fillRect(0, 0, o.width, o.height)
    drawStage(ctx, o.project, t, area, o.colors)
    drawHeader(ctx, o.project, t, o.width, o.height, o.colors)
    if (video && pip) drawPip(ctx, video, pip, o.mirrored, o.colors)
  }
  draw(0)

  const stream = canvas.captureStream(30)
  // Route the video's sound into the recording only, so the export is silent while it runs.
  let audio: AudioContext | null = null
  if (video) {
    audio = new AudioContext()
    const dest = audio.createMediaStreamDestination()
    audio.createMediaElementSource(video).connect(dest)
    for (const track of dest.stream.getAudioTracks()) stream.addTrack(track)
    await audio.resume()
  }

  const recorder = new MediaRecorder(stream, {
    mimeType: o.format.mimeType,
    videoBitsPerSecond: o.height >= 1080 ? 8_000_000 : 5_000_000,
  })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)

  let stopClock = () => {}
  const cleanup = () => {
    stopClock()
    video?.pause()
    video?.removeAttribute('src')
    video?.load()
    for (const track of stream.getTracks()) track.stop()
    void audio?.close()
  }

  try {
    return await new Promise<Blob>((resolve, reject) => {
      let finished = false
      const stopped = new Promise<void>((r) => (recorder.onstop = () => r()))
      const finish = (err?: Error) => {
        if (finished) return
        finished = true
        stopClock()
        video?.pause()
        if (recorder.state !== 'inactive') recorder.stop()
        void stopped.then(() => (err ? reject(err) : resolve(new Blob(chunks, { type: o.format.mimeType.split(';')[0] }))))
      }
      recorder.onerror = () => finish(new Error('Recording failed in this browser.'))
      o.signal?.addEventListener('abort', () => finish(new ExportCancelled()), { once: true })
      if (o.signal?.aborted) return finish(new ExportCancelled())

      const t0 = performance.now()
      const tick = () => {
        const t = video ? video.currentTime * 1000 : performance.now() - t0
        draw(Math.min(t, total))
        o.onProgress?.(Math.min(t, total), total)
        if (t >= total || video?.ended) finish()
      }
      const run = () => (stopClock = startFrameClock(tick))
      recorder.start()
      if (video) {
        video.currentTime = 0
        video.play().then(run, () => finish(new Error('The reference video couldn’t be played for the export.')))
      } else {
        run()
      }
    })
  } finally {
    cleanup()
  }
}

/* ------------------------------ saving the result ------------------------------ */

interface WritableHandle {
  name: string
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>
}

type SavePicker = (opts: {
  suggestedName: string
  types: { description: string; accept: Record<string, string[]> }[]
}) => Promise<WritableHandle>

/**
 * Ask where to save the video, before recording starts (the browser only allows the question
 * straight after a click). Resolves null where the browser has no save dialog: the video is
 * downloaded instead. Resolves false if the user cancelled.
 */
export async function pickVideoFile(suggestedName: string, format: ExportFormat): Promise<WritableHandle | null | false> {
  const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  if (typeof picker !== 'function') return null
  try {
    return await picker({
      suggestedName,
      types: [{ description: `${format.label} video`, accept: { [format.mimeType.split(';')[0]]: [`.${format.extension}`] } }],
    })
  } catch (err) {
    if (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError') return false
    throw err
  }
}

/** Write the video to the chosen file, or download it. Returns the file name it was saved under. */
export async function saveVideo(blob: Blob, handle: WritableHandle | null, fallbackName: string): Promise<string> {
  if (handle) {
    const w = await handle.createWritable()
    await w.write(blob)
    await w.close()
    return handle.name
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return fallbackName
}
