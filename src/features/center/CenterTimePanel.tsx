import clsx from 'clsx'
import { useMemo } from 'react'
import { centerDancersAt, centerTimes, routineEnd } from '@/core/centerTime'
import { readableInk } from '@/core/color'
import { formatTime } from '@/core/time'
import { usePlayheadTime } from '@/store/hooks'
import { usePlaybackStore } from '@/store/playbackStore'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { NumberField } from '@/ui/primitives'

const percent = (part: number, total: number): string => (total > 0 ? `${Math.round((part / total) * 100)}%` : '0%')

/** How long each dancer spends as the center over the whole routine. */
export function CenterTimePanel() {
  const project = useProjectStore(selectProject)
  const hasVideo = usePlaybackStore((s) => s.video !== null)
  const videoMs = usePlaybackStore((s) => s.durationMs)
  const customWidth = useUiStore((s) => s.centerZoneWidth)
  const setWidth = useUiStore((s) => s.setCenterZoneWidth)
  const selected = useUiStore((s) => s.selectedDancerIds)
  const setSelection = useUiStore((s) => s.setSelection)
  const t = usePlayheadTime(250)

  const { dancers, formations, transitions, settings, stage } = project
  const zoneWidth = customWidth ?? settings.minDistance * 2
  // With a video the routine is as long as the video; without one it ends with the last formation.
  const endMs = hasVideo ? videoMs : routineEnd(project)

  const result = useMemo(
    () => centerTimes({ dancers, formations, transitions }, endMs, zoneWidth),
    [dancers, formations, transitions, endMs, zoneWidth],
  )
  const now = centerDancersAt(project, t, zoneWidth)
  const rows = [...dancers].sort((a, b) => result.perDancer[b.id] - result.perDancer[a.id] || a.number - b.number)
  const longest = Math.max(1, ...rows.map((d) => result.perDancer[d.id]))

  if (dancers.length === 0) {
    return <p className="px-4 py-10 text-center text-muted">Add dancers to see who gets the center, and for how long.</p>
  }

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-muted">
        The center is whoever stands closest to the center line, inside the zone below. In a column down the middle it
        is the front dancer; a middle pair shares the time.
      </p>

      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <NumberField
          label="Center zone width"
          suffix={stage.units}
          step={0.5}
          min={0.5}
          max={stage.width}
          value={zoneWidth}
          onCommit={setWidth}
        />
        <button
          type="button"
          className="h-8 rounded-md px-2 text-[12px] text-muted hover:bg-raised hover:text-ink disabled:opacity-40"
          disabled={customWidth === null}
          onClick={() => setWidth(null)}
        >
          Reset
        </button>
      </div>

      {endMs <= 0 ? (
        <p className="rounded-lg bg-panel2 p-2.5 text-[12px] text-muted">
          There’s no time to measure yet. Add a second formation, give a formation a length, or load a video.
        </p>
      ) : (
        <>
          <ul className="space-y-1" aria-label="Center time for each dancer">
            {rows.map((d) => {
              const ms = result.perDancer[d.id]
              const isSel = selected.includes(d.id)
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    aria-pressed={isSel}
                    aria-label={`${d.name}: ${formatTime(ms)} in the center, ${percent(ms, result.totalMs)}${now.includes(d.id) ? ', in the center now' : ''}`}
                    title="Select this dancer on the stage"
                    onClick={() => setSelection(isSel ? selected.filter((x) => x !== d.id) : [d.id])}
                    className={clsx(
                      'flex w-full items-center gap-2 rounded-lg border p-1.5 text-left',
                      isSel ? 'border-accent-strong bg-raised' : 'border-transparent hover:bg-panel2',
                    )}
                  >
                    <span
                      className={clsx(
                        'grid size-7 shrink-0 place-items-center rounded-full text-[12px] font-bold',
                        now.includes(d.id) && 'ring-2 ring-accent-strong ring-offset-1 ring-offset-panel',
                      )}
                      style={{ background: d.color, color: readableInk(d.color) }}
                    >
                      {d.number}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px]">
                          {d.name}
                          {now.includes(d.id) && <span className="ml-1.5 text-[11px] font-medium text-accent-strong">center now</span>}
                        </span>
                        <span className="shrink-0 font-mono text-[12px] tabular-nums text-ink">
                          {formatTime(ms)} <span className="text-muted">{percent(ms, result.totalMs)}</span>
                        </span>
                      </span>
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-raised">
                        <span className="block h-full rounded-full bg-accent-strong" style={{ width: `${(ms / longest) * 100}%` }} />
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="flex justify-between border-t border-line pt-2 text-[12px] text-muted">
            <span>Nobody in the center</span>
            <span className="font-mono tabular-nums">
              {formatTime(result.noneMs)} {percent(result.noneMs, result.totalMs)}
            </span>
          </p>
          <p className="text-[11px] leading-relaxed text-muted">
            Measured over {formatTime(result.totalMs)}
            {hasVideo ? ' (the length of the video)' : ' (up to the end of the last formation)'}, including time spent
            moving through the center.
          </p>
        </>
      )}
    </div>
  )
}
