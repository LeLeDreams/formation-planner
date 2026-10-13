import { Copy, Maximize2, Plus, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { peaksToColumns } from '@/core/peaks'
import { chooseTickStep, clamp, formatTime } from '@/core/time'
import * as transport from '@/media/transport'
import { usePlaybackStore } from '@/store/playbackStore'
import { playhead } from '@/store/playheadStore'
import { useUiStore } from '@/store/uiStore'
import { FormationLane, LANE_H } from '@/features/timeline/FormationLane'
import {
  addFormationHere,
  deleteCurrentFormation,
  duplicateCurrentFormation,
} from '@/features/timeline/formationActions'
import { usePlayheadFormations } from '@/store/hooks'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { Button } from '@/ui/primitives'

const RULER_H = 24
const MIN_PX_PER_SEC = 2
const MAX_PX_PER_SEC = 600

/** Minor tick spacing (seconds) for each major spacing from chooseTickStep. */
const MINOR_FOR: Record<number, number> = {
  0.05: 0.01, 0.1: 0.02, 0.2: 0.05, 0.5: 0.1, 1: 0.2, 2: 0.5, 5: 1,
  10: 2, 15: 5, 30: 5, 60: 10, 120: 30, 300: 60, 600: 120, 1800: 300,
}

const cssVar = (name: string): string =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function TimelinePanel() {
  const durationMs = usePlaybackStore((s) => s.durationMs)
  const peaks = usePlaybackStore((s) => s.peaks)
  const peaksStatus = usePlaybackStore((s) => s.peaksStatus)
  const peaksMessage = usePlaybackStore((s) => s.peaksMessage)
  const loop = usePlaybackStore((s) => s.loop)
  const loopEnabled = usePlaybackStore((s) => s.loopEnabled)
  const hasVideo = usePlaybackStore((s) => s.video !== null)
  const theme = useUiStore((s) => s.theme)
  const hasDancers = useProjectStore((s) => selectProject(s).dancers.length > 0)
  const formationCount = useProjectStore((s) => selectProject(s).formations.length)
  const { exact } = usePlayheadFormations()

  const scrollerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const [pxPerSec, setPxPerSec] = useState(40)
  const [viewW, setViewW] = useState(800)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [heightPx, setHeightPx] = useState(110)
  // When zooming, keep the time under the cursor fixed.
  const anchor = useRef<{ ms: number; offsetX: number } | null>(null)

  const pxRef = useRef(pxPerSec)
  const pxPerMs = pxPerSec / 1000
  const totalW = Math.max(viewW, Math.ceil((durationMs / 1000) * pxPerSec) + 24)

  /* ---------- sizing ---------- */
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setViewW(el.clientWidth)
      setHeightPx(el.clientHeight)
    })
    ro.observe(el)
    setViewW(el.clientWidth)
    setHeightPx(el.clientHeight)
    return () => ro.disconnect()
  }, [])

  const fit = useCallback(() => {
    const w = scrollerRef.current?.clientWidth ?? 800
    const px = clamp((w - 32) / Math.max(1, durationMs / 1000), MIN_PX_PER_SEC, MAX_PX_PER_SEC)
    anchor.current = null
    pxRef.current = px
    setPxPerSec(px)
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0
  }, [durationMs])

  // Fit the view whenever a different-length media is loaded.
  useEffect(() => {
    fit()
  }, [fit])

  const zoomBy = useCallback((factor: number, focusX?: number) => {
    const el = scrollerRef.current
    if (!el) return
    const cur = pxRef.current
    const next = clamp(cur * factor, MIN_PX_PER_SEC, MAX_PX_PER_SEC)
    if (next === cur) return
    const offsetX = focusX ?? el.clientWidth / 2
    // If several wheel events arrive before React re-renders, keep the first anchor time.
    const ms = anchor.current ? anchor.current.ms : ((el.scrollLeft + offsetX) / cur) * 1000
    anchor.current = { ms, offsetX }
    pxRef.current = next
    setPxPerSec(next)
  }, [])

  useLayoutEffect(() => {
    const el = scrollerRef.current
    const a = anchor.current
    if (el && a) {
      el.scrollLeft = (a.ms / 1000) * pxPerSec - a.offsetX
      anchor.current = null
    }
  }, [pxPerSec])

  // Ctrl/⌘ + wheel zooms around the cursor; plain wheel scrolls horizontally.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        zoomBy(Math.exp(-e.deltaY * 0.0025), e.clientX - el.getBoundingClientRect().left)
      } else if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY
        e.preventDefault()
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy])

  /* ---------- playhead: moved imperatively, never via React state ---------- */
  useEffect(() => {
    const head = headRef.current
    const scroller = scrollerRef.current
    if (!head || !scroller) return
    const update = (t: number) => {
      const x = t * pxPerMs
      head.style.transform = `translateX(${x}px)`
      // Follow the playhead while playing, flipping a "page" when it leaves the view.
      if (usePlaybackStore.getState().playing && !dragging.current) {
        const left = scroller.scrollLeft
        const w = scroller.clientWidth
        if (x > left + w - 40 || x < left) scroller.scrollLeft = Math.max(0, x - w * 0.15)
      }
    }
    update(playhead.get())
    return playhead.subscribe(update)
  }, [pxPerMs])

  /* ---------- canvas: ruler, waveform, loop region ---------- */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    const W = viewW
    const H = heightPx
    canvas.width = Math.max(1, Math.floor(W * dpr))
    canvas.height = Math.max(1, Math.floor(H * dpr))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)

    const startMs = scrollLeft / pxPerMs
    const endMs = (scrollLeft + W) / pxPerMs
    const colors = {
      line: cssVar('--border'),
      muted: cssVar('--muted'),
      accent: cssVar('--accent'),
      strong: cssVar('--accent-strong'),
      raised: cssVar('--raised'),
    }

    // Loop region behind everything else.
    if (loop) {
      const x1 = loop.startMs * pxPerMs - scrollLeft
      const x2 = loop.endMs * pxPerMs - scrollLeft
      ctx.fillStyle = colors.accent
      ctx.globalAlpha = loopEnabled ? 0.45 : 0.22
      ctx.fillRect(x1, 0, x2 - x1, H)
      ctx.globalAlpha = 1
      ctx.fillStyle = colors.strong
      ctx.fillRect(x1, 0, 2, H)
      ctx.fillRect(x2 - 2, 0, 2, H)
    }

    // Ruler.
    ctx.fillStyle = colors.raised
    ctx.globalAlpha = 0.55
    ctx.fillRect(0, 0, W, RULER_H)
    ctx.globalAlpha = 1
    const major = chooseTickStep(pxPerSec, 80)
    const minor = MINOR_FOR[major] ?? major / 5
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    ctx.lineWidth = 1
    for (let i = Math.max(0, Math.floor(startMs / 1000 / minor)); i * minor * 1000 <= endMs; i++) {
      const s = i * minor
      const x = Math.round(s * 1000 * pxPerMs - scrollLeft) + 0.5
      const isMajor = Math.abs(s / major - Math.round(s / major)) < 1e-6
      ctx.strokeStyle = isMajor ? colors.muted : colors.line
      ctx.beginPath()
      ctx.moveTo(x, isMajor ? RULER_H - 12 : RULER_H - 6)
      ctx.lineTo(x, RULER_H)
      ctx.stroke()
      if (isMajor) {
        ctx.fillStyle = colors.muted
        ctx.fillText(formatTime(s * 1000, major < 1), x + 4, RULER_H - 14)
      }
    }
    ctx.strokeStyle = colors.line
    ctx.beginPath()
    ctx.moveTo(0, RULER_H + 0.5)
    ctx.lineTo(W, RULER_H + 0.5)
    ctx.stroke()

    // Waveform: mirrored bars, one per device-independent pixel column.
    const top = RULER_H + 6
    const bottom = H - LANE_H - 6
    const mid = (top + bottom) / 2
    const half = (bottom - top) / 2
    ctx.strokeStyle = colors.line
    ctx.beginPath()
    ctx.moveTo(0, mid + 0.5)
    ctx.lineTo(W, mid + 0.5)
    ctx.stroke()
    if (peaks && peaks.norm > 0) {
      const cols = peaksToColumns(peaks, startMs, endMs, Math.floor(W))
      ctx.fillStyle = colors.strong
      ctx.globalAlpha = 0.7
      for (let x = 0; x < cols.max.length; x++) {
        const hi = (cols.max[x] / peaks.norm) * half
        const lo = (-cols.min[x] / peaks.norm) * half
        if (hi + lo < 0.4) continue
        ctx.fillRect(x, mid - hi, 1, hi + lo || 1)
      }
      ctx.globalAlpha = 1
    }
  }, [peaks, viewW, heightPx, scrollLeft, pxPerSec, pxPerMs, loop, loopEnabled, theme])

  /* ---------- scrubbing ---------- */
  const scrubTo = (clientX: number, target: HTMLElement) => {
    const x = clientX - target.getBoundingClientRect().left
    transport.seek(x / pxPerMs)
  }

  const statusText = !hasVideo
    ? 'Load a video to see its waveform'
    : peaksStatus === 'loading'
      ? 'Drawing waveform…'
      : peaksStatus === 'unavailable'
        ? (peaksMessage ?? 'Waveform unavailable')
        : null

  return (
    <section aria-label="Timeline" className="flex h-48 shrink-0 flex-col border-t border-line bg-panel">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Timeline</h2>
        <div className="flex items-center gap-1">
          {statusText && <span className="mr-2 text-[12px] text-muted">{statusText}</span>}
          <Button label="Add formation at playhead (N)" variant="subtle" disabled={!hasDancers} onClick={addFormationHere}>
            <Plus size={16} /> <span className="hidden md:inline">Formation</span>
          </Button>
          <Button label="Duplicate this formation (Ctrl/⌘ D)" disabled={exact < 0} onClick={duplicateCurrentFormation}>
            <Copy size={15} />
          </Button>
          <Button
            label={formationCount <= 1 ? 'Delete formation (at least one is needed)' : 'Delete this formation (Delete)'}
            disabled={exact < 0 || formationCount <= 1}
            onClick={deleteCurrentFormation}
          >
            <Trash2 size={15} />
          </Button>
          <div className="mx-1 h-5 w-px bg-line" aria-hidden="true" />
          <Button label="Zoom out" onClick={() => zoomBy(1 / 1.5)}>
            <ZoomOut size={16} />
          </Button>
          <Button label="Zoom in" onClick={() => zoomBy(1.5)}>
            <ZoomIn size={16} />
          </Button>
          <Button label="Fit whole timeline" onClick={fit}>
            <Maximize2 size={15} />
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="relative min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <div
          className="relative h-full cursor-col-resize touch-pan-x select-none"
          style={{ width: totalW }}
          onPointerDown={(e) => {
            dragging.current = true
            e.currentTarget.setPointerCapture(e.pointerId)
            scrubTo(e.clientX, e.currentTarget)
          }}
          onPointerMove={(e) => {
            if (dragging.current) scrubTo(e.clientX, e.currentTarget)
          }}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
        >
          <canvas
            ref={canvasRef}
            className="sticky left-0 top-0 block"
            style={{ width: viewW, height: heightPx }}
            aria-hidden="true"
          />
          <FormationLane pxPerMs={pxPerMs} />
          <div
            ref={headRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-0"
          >
            <div className="absolute inset-y-0 -left-px w-0.5 bg-accent-strong" />
            <div className="absolute -left-[6px] top-0 size-3 rounded-b-md bg-accent-strong [clip-path:polygon(0_0,100%_0,50%_100%)]" />
          </div>
        </div>
      </div>
    </section>
  )
}
