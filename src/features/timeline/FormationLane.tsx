import { useRef } from 'react'
import { formationName } from '@/core/formations'
import { effectiveHold } from '@/core/interpolate'
import { formatTime } from '@/core/time'
import * as transport from '@/media/transport'
import { usePlayheadFormations } from '@/store/hooks'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { deleteCurrentFormation } from './formationActions'

export const LANE_H = 34
const COLORS = ['--pink', '--mint', '--sky', '--peach', '--lemon', '--lilac']
/** Width of the grip that sets how long a formation is held. */
const GRIP_W = 9
/** Room given to the last formation's label when it has no hold to show. */
const LAST_MIN_W = 120

const seconds = (ms: number): string => `${Math.round(ms / 100) / 10} s`

/**
 * One row of formation blocks under the waveform. Each block runs from its formation to the
 * next: the solid part is how long the formation is held, the pale part is the move that follows.
 * Drag the block to move it in time; drag the grip between the two parts to change the hold.
 */
export function FormationLane({ pxPerMs }: { pxPerMs: number }) {
  const formations = useProjectStore((s) => selectProject(s).formations)
  const hasDancers = useProjectStore((s) => selectProject(s).dancers.length > 0)
  const { index, exact } = usePlayheadFormations()
  const drag = useRef<{ x0: number; t0: number; moved: boolean } | null>(null)
  const resize = useRef<{ x0: number; hold0: number; gap0: number } | null>(null)

  const retime = (id: string, t: number) => {
    useProjectStore.getState().setFormationTime(id, t)
    // The store may have nudged it to keep formations apart; follow where it really landed.
    const landed = useProjectStore.getState().history.present.formations.find((f) => f.id === id)
    if (landed) transport.seek(landed.timeMs)
  }

  return (
    <div
      className="absolute inset-x-0 bottom-0 border-t border-line bg-panel2/80"
      style={{ height: LANE_H }}
      data-testid="formation-lane"
    >
      {formations.length === 0 && (
        <p className="sticky left-3 flex h-full items-center px-3 text-[12px] text-muted">
          {hasDancers ? 'Press N to add a formation at the playhead' : 'Add dancers, then press N to add formations'}
        </p>
      )}
      {formations.map((f, i) => {
        const left = f.timeMs * pxPerMs
        const next = formations[i + 1]
        const hold = effectiveHold(formations, i)
        const holdPx = hold * pxPerMs
        const gap = next ? next.timeMs - f.timeMs - hold : 0
        const width = Math.max(20, next ? (next.timeMs - f.timeMs) * pxPerMs - 2 : Math.max(holdPx, LAST_MIN_W))
        const solid = Math.min(holdPx, width)
        const isCurrent = i === index
        const isExact = i === exact
        const name = formationName(f, i)
        const color = `var(${COLORS[i % COLORS.length]})`
        const pale = `color-mix(in srgb, ${color} 30%, var(--panel-2))`
        const summary = next
          ? `held ${seconds(hold)}, then ${seconds(gap)} to move to ${formationName(next, i + 1)}`
          : `held ${seconds(hold)}`
        const setHold = (ms: number, ripple: boolean, gapMs = gap) =>
          useProjectStore.getState().setFormationHold(f.id, ms, ripple ? gapMs : undefined)
        return (
          <button
            key={f.id}
            type="button"
            title={`${name} · ${formatTime(f.timeMs)} · ${summary}`}
            aria-label={`${name}, formation ${i + 1} at ${formatTime(f.timeMs)}, ${summary}`}
            aria-current={isExact ? 'true' : undefined}
            className={
              'absolute top-1 flex h-[26px] items-center gap-1 overflow-hidden rounded-lg border pl-2.5 pr-1.5 text-left text-[12px] font-medium text-ink shadow-sm transition-shadow hover:shadow-md ' +
              (isExact
                ? 'border-accent-strong ring-2 ring-accent-strong'
                : isCurrent
                  ? 'border-accent-strong/60'
                  : 'border-line')
            }
            style={{
              left,
              width,
              background: `linear-gradient(to right, ${color} ${solid}px, ${pale} ${solid}px)`,
              cursor: 'grab',
              touchAction: 'none',
            }}
            onPointerDown={(e) => {
              e.stopPropagation()
              e.currentTarget.setPointerCapture(e.pointerId)
              drag.current = { x0: e.clientX, t0: f.timeMs, moved: false }
              transport.seek(f.timeMs)
            }}
            onPointerMove={(e) => {
              const d = drag.current
              if (!d) return
              const dx = e.clientX - d.x0
              if (!d.moved && Math.abs(dx) < 4) return
              d.moved = true
              retime(f.id, d.t0 + dx / pxPerMs)
            }}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault()
                e.stopPropagation()
                const step = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1000 : 100)
                // Alt changes how long the formation is held; plain arrows move it in time.
                if (e.altKey) setHold(hold + step, false)
                else retime(f.id, f.timeMs + step)
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault()
                e.stopPropagation()
                transport.seek(f.timeMs)
                deleteCurrentFormation()
              } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                transport.seek(f.timeMs)
              }
            }}
          >
            <span className="shrink-0 rounded bg-panel/70 px-1 text-[10px] font-bold">{i + 1}</span>
            <span className="truncate">{f.label.trim() || `Formation ${i + 1}`}</span>
            <span
              data-testid={`hold-grip-${i + 1}`}
              title={
                next
                  ? 'Drag to set how long this formation is held. Hold Shift to push the later formations along too.'
                  : 'Drag to set how long this formation is held.'
              }
              className="group absolute inset-y-0 flex justify-center"
              style={{ left: Math.max(0, Math.min(solid - GRIP_W / 2, width - GRIP_W)), width: GRIP_W, cursor: 'ew-resize' }}
              onPointerDown={(e) => {
                e.stopPropagation()
                e.currentTarget.setPointerCapture(e.pointerId)
                resize.current = { x0: e.clientX, hold0: hold, gap0: gap }
              }}
              onPointerMove={(e) => {
                const r = resize.current
                if (!r) return
                e.stopPropagation()
                setHold(r.hold0 + (e.clientX - r.x0) / pxPerMs, e.shiftKey, r.gap0)
              }}
              onPointerUp={(e) => {
                e.stopPropagation()
                resize.current = null
              }}
              onPointerCancel={() => (resize.current = null)}
            >
              <span className="my-1 w-[3px] rounded-full bg-ink/45 group-hover:bg-accent-strong" />
            </span>
          </button>
        )
      })}
    </div>
  )
}
