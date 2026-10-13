import Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Arrow, Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva'
import { findCrowded } from '@/core/collision'
import { getFrameAt, getTransition, defaultControl, quadBezier } from '@/core/interpolate'
import type { DancerId, Formation, Vec2 } from '@/core/model'
import { snapPoint, type SnapGuide } from '@/core/snap'
import { VIEW_ROT, clampPoint, fromView, reachBounds, round2, toView, viewExtent } from '@/core/stage'
import * as transport from '@/media/transport'
import { usePlayheadFormations } from '@/store/hooks'
import { playhead } from '@/store/playheadStore'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { readStageColors } from './colors'
import { DancerMarker, MARKER_R, type MarkerHandlers, type MarkerNodes } from './DancerMarker'
import { Floor } from './Floor'

// Only the main mouse button drags dancers; middle/right are for panning.
Konva.dragButtons = [0]

interface View {
  ppu: number
  ox: number
  oy: number
}

interface DragState {
  anchor: DancerId
  ids: DancerId[]
  start: Map<DancerId, Vec2>
  t: number
  targets: Vec2[]
}

const MIN_PPU = 2
const MAX_PPU = 140
const PAD = 34

export const stageControls = {
  zoomBy: (_factor: number) => {},
  fit: () => {},
}

export function StageCanvas({ overlay = false }: { overlay?: boolean }) {
  const project = useProjectStore(selectProject)
  const { stage, dancers, settings } = project
  const theme = useUiStore((s) => s.theme)
  const selected = useUiStore((s) => s.selectedDancerIds)
  const onionOn = useUiStore((s) => s.onion)
  const pathsOn = useUiStore((s) => s.paths)
  const colors = useMemo(() => readStageColors(), [theme]) // eslint-disable-line react-hooks/exhaustive-deps
  const { index, exact } = usePlayheadFormations()

  const wrapRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<Konva.Layer>(null)
  const nodes = useRef(new Map<DancerId, MarkerNodes>())
  const drag = useRef<DragState | null>(null)
  const draggingIds = useRef(new Set<DancerId>())
  const marqueeStart = useRef<{ x: number; y: number; shift: boolean } | null>(null)

  const [size, setSize] = useState({ w: 0, h: 0 })
  const [view, setView] = useState<View>({ ppu: 8, ox: 0, oy: 0 })
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const userMoved = useRef(false)

  // Latest values for the long-lived handlers below.
  const projectRef = useRef(project)
  projectRef.current = project
  const viewRef = useRef(view)
  viewRef.current = view
  const sizeRef = useRef(size)
  sizeRef.current = size

  /* ------------------------------ sizing + view ------------------------------ */

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const fitView = useCallback((): View => {
    const { w, h } = sizeRef.current
    const ext = viewExtent(projectRef.current.stage)
    const ppu = Math.max(MIN_PPU, Math.min((w - PAD * 2) / ext.w, (h - PAD * 2) / ext.h))
    return { ppu, ox: w / 2, oy: h / 2 }
  }, [])

  useEffect(() => {
    if (size.w > 0 && size.h > 0 && !userMoved.current) setView(fitView())
  }, [size.w, size.h, stage.width, stage.depth, stage.wingDepth, stage.audienceSide, fitView])

  const zoomAt = useCallback((cx: number, cy: number, factor: number) => {
    userMoved.current = true
    setView((v) => {
      const ppu = Math.min(MAX_PPU, Math.max(MIN_PPU, v.ppu * factor))
      const k = ppu / v.ppu
      // Keep the point under the cursor fixed.
      return { ppu, ox: cx - (cx - v.ox) * k, oy: cy - (cy - v.oy) * k }
    })
  }, [])

  const panBy = useCallback((dx: number, dy: number) => {
    userMoved.current = true
    setView((v) => ({ ...v, ox: v.ox + dx, oy: v.oy + dy }))
  }, [])

  useEffect(() => {
    stageControls.zoomBy = (f) => zoomAt(sizeRef.current.w / 2, sizeRef.current.h / 2, f)
    stageControls.fit = () => {
      userMoved.current = false
      setView(fitView())
    }
  }, [zoomAt, fitView])

  // Wheel / trackpad: pinch or Ctrl/⌘+wheel zooms, plain scrolling pans. Needs a non-passive listener.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.01))
      else if (e.shiftKey) panBy(-e.deltaY, 0)
      else panBy(-e.deltaX, -e.deltaY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, panBy])

  // Middle/right mouse drag pans; two fingers pinch-zoom and pan.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let panning = false
    let last = { x: 0, y: 0 }
    const onDown = (e: MouseEvent) => {
      if (e.button === 1 || e.button === 2) {
        panning = true
        last = { x: e.clientX, y: e.clientY }
        e.preventDefault()
      }
    }
    const onMove = (e: MouseEvent) => {
      if (!panning) return
      panBy(e.clientX - last.x, e.clientY - last.y)
      last = { x: e.clientX, y: e.clientY }
    }
    const onUp = () => (panning = false)

    let pinch: { dist: number; cx: number; cy: number } | null = null
    const pinchState = (e: TouchEvent) => {
      const [a, b] = [e.touches[0], e.touches[1]]
      const r = el.getBoundingClientRect()
      return {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        cx: (a.clientX + b.clientX) / 2 - r.left,
        cy: (a.clientY + b.clientY) / 2 - r.top,
      }
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // A second finger cancels any dancer drag in progress.
        const d = drag.current
        if (d) nodes.current.get(d.anchor)?.group.stopDrag()
        pinch = pinchState(e)
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinch) return
      e.preventDefault()
      const next = pinchState(e)
      panBy(next.cx - pinch.cx, next.cy - pinch.cy)
      if (pinch.dist > 0) zoomAt(next.cx, next.cy, next.dist / pinch.dist)
      pinch = next
    }
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null
    }
    el.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [panBy, zoomAt])

  /* ------------------------ playback: update markers directly ------------------------ */

  const syncFrame = useCallback((t: number) => {
    const proj = projectRef.current
    const frame = getFrameAt(proj, t)
    const side = proj.stage.audienceSide
    const rot = VIEW_ROT[side]
    const present: { id: string; x: number; y: number }[] = []
    for (const d of proj.dancers) {
      const refs = nodes.current.get(d.id)
      const s = frame[d.id]
      if (!refs || !s || draggingIds.current.has(d.id)) continue
      refs.group.position(toView(s, side))
      refs.group.opacity(s.opacity)
      refs.group.visible(s.opacity > 0.02)
      refs.facing.rotation(s.facing + rot)
      if (s.opacity > 0.5) present.push({ id: d.id, x: s.x, y: s.y })
    }
    // Crowding warnings, in a formation and mid-transition alike.
    const crowded = findCrowded(present, proj.settings.minDistance)
    for (const d of proj.dancers) nodes.current.get(d.id)?.warn.visible(crowded.has(d.id))
    layerRef.current?.batchDraw()
  }, [])

  // Dev-only hook so automated browser tests can find where a dancer is on screen.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as Record<string, unknown>).__fp = {
      dancerPos: (id: string) => {
        const n = nodes.current.get(id)?.group
        const r = wrapRef.current?.getBoundingClientRect()
        if (!n || !r) return null
        const p = n.getAbsolutePosition()
        return { x: r.left + p.x, y: r.top + p.y }
      },
      ppu: () => viewRef.current.ppu,
    }
  }, [])

  useLayoutEffect(() => {
    syncFrame(playhead.get())
  })
  useEffect(() => playhead.subscribe(syncFrame), [syncFrame])

  /* --------------------------------- interactions --------------------------------- */

  const handlers = useMemo<MarkerHandlers>(
    () => ({
      register: (id, n) => {
        if (n) nodes.current.set(id, n)
        else nodes.current.delete(id)
      },
      press: (id, e) => {
        wrapRef.current?.focus({ preventScroll: true })
        const ui = useUiStore.getState()
        const shift = 'shiftKey' in e.evt && e.evt.shiftKey
        if (!shift && !ui.selectedDancerIds.includes(id)) ui.setSelection([id])
      },
      click: (id, e) => {
        const ui = useUiStore.getState()
        const sel = ui.selectedDancerIds
        const shift = 'shiftKey' in e.evt && e.evt.shiftKey
        if (shift) ui.setSelection(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id])
        else if (sel.length > 1) ui.setSelection([id])
      },
      dragStart: (id, e) => {
        transport.pause()
        const ui = useUiStore.getState()
        let ids = ui.selectedDancerIds
        if (!ids.includes(id)) {
          const shift = 'shiftKey' in e.evt && e.evt.shiftKey
          ids = shift ? [...ids, id] : [id]
          ui.setSelection(ids)
        }
        const t = playhead.get()
        const proj = projectRef.current
        const frame = getFrameAt(proj, t)
        const start = new Map<DancerId, Vec2>()
        for (const i of ids) {
          const n = nodes.current.get(i)
          if (n) start.set(i, { ...n.group.position() })
        }
        const targets = proj.dancers
          .filter((d) => !ids.includes(d.id) && (frame[d.id]?.opacity ?? 0) > 0.5)
          .map((d) => ({ x: frame[d.id].x, y: frame[d.id].y }))
        drag.current = { anchor: id, ids, start, t, targets }
        draggingIds.current = new Set(ids)
      },
      dragMove: (id) => {
        const d = drag.current
        const node = nodes.current.get(id)?.group
        if (!d || d.anchor !== id || !node) return
        const proj = projectRef.current
        const side = proj.stage.audienceSide
        const raw = fromView(node.position(), side)
        const snapped = snapPoint(raw, {
          grid: proj.settings.snapToGrid ? proj.settings.gridSize : null,
          targets: d.targets,
          threshold: 8 / viewRef.current.ppu,
          guides: useUiStore.getState().guides,
        })
        const clamped = clampPoint(snapped, reachBounds(proj.stage))
        const sv = toView(clamped, side)
        node.position(sv)
        const origin = d.start.get(id)
        if (origin) {
          const dx = sv.x - origin.x
          const dy = sv.y - origin.y
          for (const [oid, st] of d.start) {
            if (oid !== id) nodes.current.get(oid)?.group.position({ x: st.x + dx, y: st.y + dy })
          }
        }
        // Only the guides that were actually used (and only when they change) hit React.
        const g = snapped.guides.filter((x) => x.axis === 'x' ? clamped.x === x.value : clamped.y === x.value)
        setGuides((prev) =>
          prev.length === g.length && prev.every((p, i) => p.axis === g[i].axis && p.value === g[i].value) ? prev : g,
        )
      },
      dragEnd: (id) => {
        const d = drag.current
        if (!d || d.anchor !== id) return
        const side = projectRef.current.stage.audienceSide
        const patches: Record<DancerId, { x: number; y: number }> = {}
        let moved = false
        for (const oid of d.ids) {
          const n = nodes.current.get(oid)
          const s = d.start.get(oid)
          if (!n || !s) continue
          const pos = n.group.position()
          if (Math.hypot(pos.x - s.x, pos.y - s.y) > 1e-6) moved = true
          const p = fromView(pos, side)
          patches[oid] = { x: round2(p.x), y: round2(p.y) }
        }
        drag.current = null
        draggingIds.current = new Set()
        setGuides([])
        if (moved) {
          useProjectStore.getState().setPoses(d.t, patches, d.ids.length > 1 ? 'Move dancers' : 'Move dancer')
        }
        syncFrame(playhead.get())
      },
    }),
    [syncFrame],
  )

  /** Pointer position in view units (the stage's rotated, unscaled coordinates). */
  const pointerUnits = (stg: Konva.Stage): Vec2 | null => {
    const p = stg.getPointerPosition()
    if (!p) return null
    const v = viewRef.current
    return { x: (p.x - v.ox) / v.ppu, y: (p.y - v.oy) / v.ppu }
  }

  const onBgDown = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    wrapRef.current?.focus({ preventScroll: true })
    const stg = e.target.getStage()
    if (!stg || e.target !== stg) return
    if ('button' in e.evt && e.evt.button !== 0) return
    if ('touches' in e.evt && e.evt.touches.length > 1) return
    const u = pointerUnits(stg)
    if (!u) return
    marqueeStart.current = { ...u, shift: 'shiftKey' in e.evt && e.evt.shiftKey }
    setMarquee({ x1: u.x, y1: u.y, x2: u.x, y2: u.y })
  }

  const onBgMove = (e: KonvaEventObject<MouseEvent | TouchEvent>) => {
    const s = marqueeStart.current
    const stg = e.target.getStage()
    if (!s || !stg) return
    if ('touches' in e.evt && e.evt.touches.length > 1) {
      marqueeStart.current = null
      setMarquee(null)
      return
    }
    const u = pointerUnits(stg)
    if (u) setMarquee({ x1: s.x, y1: s.y, x2: u.x, y2: u.y })
  }

  const onBgUp = () => {
    const s = marqueeStart.current
    marqueeStart.current = null
    const m = marquee
    setMarquee(null)
    if (!s || !m) return
    const ui = useUiStore.getState()
    const small = Math.hypot(m.x2 - m.x1, m.y2 - m.y1) * viewRef.current.ppu < 4
    if (small) {
      if (!s.shift) ui.setSelection([])
      return
    }
    const [x0, x1] = [Math.min(m.x1, m.x2), Math.max(m.x1, m.x2)]
    const [y0, y1] = [Math.min(m.y1, m.y2), Math.max(m.y1, m.y2)]
    const proj = projectRef.current
    const frame = getFrameAt(proj, playhead.get())
    const hit = proj.dancers
      .filter((d) => {
        const f = frame[d.id]
        if (!f || f.opacity < 0.5) return false
        const v = toView(f, proj.stage.audienceSide)
        return v.x >= x0 && v.x <= x1 && v.y >= y0 && v.y <= y1
      })
      .map((d) => d.id)
    ui.setSelection(s.shift ? [...new Set([...ui.selectedDancerIds, ...hit])] : hit)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const ui = useUiStore.getState()
    const mod = e.ctrlKey || e.metaKey
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      ui.setSelection(projectRef.current.dancers.map((d) => d.id))
      return
    }
    if (mod) return
    if (e.key === '+' || e.key === '=') return void (e.preventDefault(), stageControls.zoomBy(1.25))
    if (e.key === '-' || e.key === '_') return void (e.preventDefault(), stageControls.zoomBy(0.8))
    if (e.key === '0') return void (e.preventDefault(), stageControls.fit())

    const arrows: Record<string, Vec2> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const dir = arrows[e.key]
    const sel = ui.selectedDancerIds
    if (!dir || sel.length === 0) return // with nothing selected, arrows step video frames instead
    e.preventDefault()
    e.stopPropagation()
    const proj = projectRef.current
    const step = (e.shiftKey ? 5 : 1) * (proj.settings.snapToGrid ? proj.settings.gridSize : 0.5)
    const d = fromView({ x: dir.x * step, y: dir.y * step }, proj.stage.audienceSide)
    const t = playhead.get()
    const frame = getFrameAt(proj, t)
    const patches: Record<DancerId, { x: number; y: number }> = {}
    for (const id of sel) {
      const f = frame[id]
      if (f) patches[id] = { x: f.x + d.x, y: f.y + d.y }
    }
    useProjectStore.getState().setPoses(t, patches, 'Nudge dancers', { coalesceKey: 'nudge' })
  }

  /* ------------------------ ghost of the next formation ------------------------ */

  const f = project.formations
  const nextF = exact >= 0 ? f[exact + 1] : f[index + 1]
  const pathFrom = exact >= 0 ? f[exact] : f[index]

  const side = stage.audienceSide
  const rot = VIEW_ROT[side]

  const pathLines = useMemo(() => {
    if (!pathsOn || !pathFrom || !nextF) return []
    const tr = getTransition(project.transitions, pathFrom.id)
    const out: { id: string; color: string; points: number[] }[] = []
    for (const d of dancers) {
      const a = pathFrom.positions[d.id]
      const b = nextF.positions[d.id]
      if (!a || !b || (!a.present && !b.present)) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) < 0.4) continue
      const dt = tr?.perDancer[d.id]
      const pts: Vec2[] = []
      if (dt?.path === 'curved') {
        const c = dt.control ?? defaultControl(a, b)
        for (let i = 0; i <= 14; i++) pts.push(quadBezier(a, c, b, i / 14))
      } else pts.push({ x: a.x, y: a.y }, { x: b.x, y: b.y })
      out.push({ id: d.id, color: d.color, points: pts.flatMap((p) => { const v = toView(p, side); return [v.x, v.y] }) })
    }
    return out
  }, [pathsOn, pathFrom, nextF, project.transitions, dancers, side])

  const ghosts = (fm: Formation | undefined, stroke: string) =>
    fm &&
    dancers.map((d) => {
      const s = fm.positions[d.id]
      if (!s || !s.present) return null
      const v = toView(s, side)
      return (
        <Group key={d.id} x={v.x} y={v.y} listening={false} opacity={0.7}>
          <Circle radius={MARKER_R * 0.85} fill={d.color} opacity={0.35} stroke={stroke} strokeWidth={1.5} strokeScaleEnabled={false} dash={[3, 3]} />
          <Text
            text={String(d.number)}
            x={-MARKER_R}
            y={-MARKER_R}
            width={MARKER_R * 2}
            height={MARKER_R * 2}
            align="center"
            verticalAlign="middle"
            fontSize={MARKER_R * 0.8}
            fill={colors.ink}
          />
        </Group>
      )
    })

  /* ------------------------------------- render ------------------------------------- */

  return (
    <div
      ref={wrapRef}
      data-stage
      tabIndex={0}
      role="application"
      aria-label="Stage. Select dancers and drag them, or use the arrow keys to nudge the selection."
      className="relative size-full touch-none overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-strong"
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {size.w > 0 && (
        <Stage
          width={size.w}
          height={size.h}
          onMouseDown={onBgDown}
          onTouchStart={onBgDown}
          onMouseMove={onBgMove}
          onTouchMove={onBgMove}
          onMouseUp={onBgUp}
          onTouchEnd={onBgUp}
        >
          <Layer x={view.ox} y={view.oy} scaleX={view.ppu} scaleY={view.ppu} listening={false}>
            <Floor stage={stage} gridSize={settings.gridSize} ppu={view.ppu} colors={colors} overlay={overlay} />
          </Layer>

          {onionOn && (
            <Layer x={view.ox} y={view.oy} scaleX={view.ppu} scaleY={view.ppu} listening={false}>
              {ghosts(nextF, colors.accent)}
            </Layer>
          )}
          {pathsOn && (
            <Layer x={view.ox} y={view.oy} scaleX={view.ppu} scaleY={view.ppu} listening={false}>
              {pathLines.map((l) => (
                <Arrow
                  key={l.id}
                  points={l.points}
                  stroke={colors.accent}
                  fill={colors.accent}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  pointerLength={0.9}
                  pointerWidth={0.8}
                  dash={[0.9, 0.7]}
                  opacity={0.75}
                />
              ))}
            </Layer>
          )}

          <Layer ref={layerRef} x={view.ox} y={view.oy} scaleX={view.ppu} scaleY={view.ppu}>
            {dancers.map((d) => (
              <DancerMarker
                key={d.id}
                dancer={d}
                selected={selected.includes(d.id)}
                colors={colors}
                overlay={overlay}
                handlers={handlers}
              />
            ))}
          </Layer>

          <Layer x={view.ox} y={view.oy} scaleX={view.ppu} scaleY={view.ppu} listening={false}>
            <Group rotation={rot}>
              {guides.map((g) => (
                <Line
                  key={`${g.axis}${g.value}`}
                  points={g.axis === 'x' ? [g.value, -300, g.value, 300] : [-300, g.value, 300, g.value]}
                  stroke={colors.accent}
                  strokeWidth={1.5}
                  strokeScaleEnabled={false}
                  dash={[6, 4]}
                />
              ))}
            </Group>
            {marquee && (
              <Rect
                x={Math.min(marquee.x1, marquee.x2)}
                y={Math.min(marquee.y1, marquee.y2)}
                width={Math.abs(marquee.x2 - marquee.x1)}
                height={Math.abs(marquee.y2 - marquee.y1)}
                fill={colors.accentFill}
                opacity={0.35}
                stroke={colors.accent}
                strokeWidth={1}
                strokeScaleEnabled={false}
              />
            )}
          </Layer>
        </Stage>
      )}
    </div>
  )
}
