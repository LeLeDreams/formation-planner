import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { findFormationIndex } from '@/core/interpolate'
import { formationIndexAt } from '@/core/formations'
import type { Formation, Ms } from '@/core/model'
import { usePlaybackStore } from './playbackStore'
import { playhead } from './playheadStore'
import { selectProject, useProjectStore } from './projectStore'

/**
 * These hooks follow the playhead without re-rendering on every frame: they only update React
 * state when the thing a component actually cares about changes.
 */

export interface PlayheadFormations {
  /** Last formation at or before the playhead (-1 before the first). */
  index: number
  /** Index of the formation the playhead is sitting on (within tolerance), or -1. */
  exact: number
}

export function usePlayheadFormations(): PlayheadFormations {
  const formations = useProjectStore((s) => selectProject(s).formations)
  // Read during render (not from state set in an effect), so the indexes always belong to the
  // formations being rendered: a stale index after a delete would point past the end of the list.
  const key = useSyncExternalStore(playhead.subscribe, () => {
    const t = playhead.get()
    return `${findFormationIndex(formations, t)}:${formationIndexAt(formations, t)}`
  })
  return useMemo(() => {
    const [index, exact] = key.split(':').map(Number)
    return { index, exact }
  }, [key])
}

/** Playhead time as React state, throttled (default ~8 updates/second while playing). */
export function usePlayheadTime(intervalMs = 120): Ms {
  const [t, setT] = useState(() => playhead.get())
  const last = useRef(0)
  useEffect(() => {
    let timer = 0
    const update = (time: Ms) => {
      const playing = usePlaybackStore.getState().playing
      const now = performance.now()
      window.clearTimeout(timer)
      if (!playing || now - last.current >= intervalMs) {
        last.current = now
        setT(time)
      } else {
        // Make sure the final value lands even if updates stop.
        timer = window.setTimeout(() => setT(playhead.get()), intervalMs)
      }
    }
    update(playhead.get())
    const off = playhead.subscribe(update)
    return () => {
      off()
      window.clearTimeout(timer)
    }
  }, [intervalMs])
  return t
}

export function currentFormation(formations: Formation[], index: number): Formation | undefined {
  return formations[Math.max(0, index)]
}
