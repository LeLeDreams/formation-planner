import { Check, Clapperboard, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { formatTime } from '@/core/time'
import { readStageColors } from '@/features/stage/colors'
import * as transport from '@/media/transport'
import { usePlaybackStore } from '@/store/playbackStore'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/ui/primitives'
import type { Corner, FrameColors } from './drawFrame'
import {
  ExportCancelled,
  canExportVideo,
  exportRoutineVideo,
  pickVideoFile,
  routineLength,
  saveVideo,
  supportedFormats,
} from './exportVideo'

const CORNERS: { value: Corner | 'none'; label: string }[] = [
  { value: 'top-right', label: 'Top right' },
  { value: 'top-left', label: 'Top left' },
  { value: 'bottom-right', label: 'Bottom right' },
  { value: 'bottom-left', label: 'Bottom left' },
  { value: 'none', label: 'Don’t show it (sound only)' },
]

const PIP_SIZES = [
  { value: 0.2, label: 'Small' },
  { value: 0.28, label: 'Medium' },
  { value: 0.38, label: 'Large' },
]

const SIZES = [
  { value: 720, label: '720p (smaller file)' },
  { value: 1080, label: '1080p (sharper)' },
]

const slug = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'routine'

function frameColors(): FrameColors {
  const c = readStageColors()
  return {
    background: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim(),
    floor: c.floor,
    wing: c.wing,
    border: c.border,
    grid: c.grid,
    center: c.center,
    front: c.front,
    ink: c.ink,
    muted: c.muted,
  }
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'recording'; doneMs: number; totalMs: number }
  | { kind: 'done'; fileName: string }
  | { kind: 'error'; message: string }

const selectClass = 'h-8 w-full rounded-md border border-line bg-panel2 px-2 text-[13px] text-ink'

export function ExportDialog() {
  const open = useUiStore((s) => s.showExport)
  const setOpen = useUiStore((s) => s.setShowExport)
  const mirrored = useUiStore((s) => s.mirrorVideo)
  const project = useProjectStore(selectProject)
  const video = usePlaybackStore((s) => s.video)
  const videoMs = usePlaybackStore((s) => s.durationMs)

  const formats = supportedFormats()
  const [corner, setCorner] = useState<Corner | 'none'>('top-right')
  const [pipSize, setPipSize] = useState(0.28)
  const [height, setHeight] = useState(720)
  const [extension, setExtension] = useState(formats[0]?.extension ?? 'webm')
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const abort = useRef<AbortController | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  if (!open) return null

  const recording = phase.kind === 'recording'
  const totalMs = video ? videoMs : routineLength(project)
  const format = formats.find((f) => f.extension === extension) ?? formats[0]
  const close = () => {
    abort.current?.abort()
    setPhase({ kind: 'idle' })
    setOpen(false)
  }

  const start = async () => {
    if (!format) return
    const fileName = `${slug(project.name)}.${format.extension}`
    try {
      // Must come first: the browser only shows its save dialog straight after a click.
      const handle = await pickVideoFile(fileName, format)
      if (handle === false) return
      transport.pause()
      abort.current = new AbortController()
      setPhase({ kind: 'recording', doneMs: 0, totalMs })
      let lastShown = -1
      const blob = await exportRoutineVideo({
        project,
        videoUrl: video?.url ?? null,
        corner: corner === 'none' ? null : corner,
        pipSize,
        mirrored,
        width: Math.round((height * 16) / 9),
        height,
        format,
        colors: frameColors(),
        signal: abort.current.signal,
        onProgress: (doneMs, total) => {
          // A few updates a second is plenty for a progress bar.
          const step = Math.floor(doneMs / 250)
          if (step !== lastShown) {
            lastShown = step
            setPhase({ kind: 'recording', doneMs, totalMs: total })
          }
        },
      })
      setPhase({ kind: 'done', fileName: await saveVideo(blob, handle, fileName) })
    } catch (err) {
      if (err instanceof ExportCancelled) setPhase({ kind: 'idle' })
      else {
        console.warn('Video export failed', err)
        setPhase({ kind: 'error', message: err instanceof Error ? err.message : 'The export didn’t work.' })
      }
    } finally {
      abort.current = null
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && !recording && close()}
      onKeyDown={(e) => e.key === 'Escape' && !recording && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export video"
        className="w-full max-w-md rounded-2xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">Export video</h2>
          <Button ref={closeRef} label={recording ? 'Cancel export and close' : 'Close'} onClick={close}>
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-4 px-5 py-4 text-[13px]">
          {!canExportVideo() ? (
            <p role="alert" className="text-danger">
              This browser can’t record video. Try Chrome or Edge.
            </p>
          ) : (
            <>
              <p className="leading-relaxed text-muted">
                Makes a video of the formations moving on stage
                {video ? ', with your reference video and its sound in a corner.' : '. Add a reference video to include it and its sound.'}
              </p>

              <fieldset disabled={recording} className="grid grid-cols-2 gap-3 disabled:opacity-50">
                {video && (
                  <>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">Reference video</span>
                      <select className={selectClass} value={corner} onChange={(e) => setCorner(e.target.value as Corner | 'none')}>
                        {CORNERS.map((c) => (
                          <option key={c.value} value={c.value}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">Its size</span>
                      <select
                        className={selectClass}
                        value={pipSize}
                        disabled={corner === 'none'}
                        onChange={(e) => setPipSize(Number(e.target.value))}
                      >
                        {PIP_SIZES.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">Quality</span>
                  <select className={selectClass} value={height} onChange={(e) => setHeight(Number(e.target.value))}>
                    {SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">File type</span>
                  <select className={selectClass} value={extension} onChange={(e) => setExtension(e.target.value as 'mp4' | 'webm')}>
                    {formats.map((f) => (
                      <option key={f.extension} value={f.extension}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>

              {phase.kind === 'idle' && (
                <p className="rounded-lg bg-panel2 px-3 py-2 text-[12px] leading-relaxed text-muted">
                  The video is recorded as it plays, so this takes about {formatTime(totalMs, false)}. Keep this tab open
                  until it finishes (best left in front, so the picture stays smooth).
                  {video && mirrored && corner !== 'none' && ' The reference video will be mirrored, as it is on screen.'}
                </p>
              )}
              {phase.kind === 'recording' && (
                <div className="space-y-1.5" role="status">
                  <div className="h-2 overflow-hidden rounded-full bg-raised">
                    <div
                      className="h-full bg-accent-strong"
                      style={{ width: `${Math.min(100, (phase.doneMs / Math.max(1, phase.totalMs)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[12px] text-muted">
                    Recording {formatTime(phase.doneMs, false)} of {formatTime(phase.totalMs, false)}. Keep this tab open.
                  </p>
                </div>
              )}
              {phase.kind === 'done' && (
                <p role="status" className="flex items-center gap-1.5 text-[13px] text-ok">
                  <Check size={15} /> Saved as {phase.fileName}
                </p>
              )}
              {phase.kind === 'error' && (
                <p role="alert" className="text-[13px] text-danger">
                  {phase.message}
                </p>
              )}

              <div className="flex justify-end gap-2">
                {recording ? (
                  <Button variant="subtle" onClick={() => abort.current?.abort()}>
                    Cancel
                  </Button>
                ) : (
                  <Button variant="solid" disabled={project.dancers.length === 0} onClick={() => void start()}>
                    <Clapperboard size={15} /> {phase.kind === 'done' ? 'Export again' : 'Export video'}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
