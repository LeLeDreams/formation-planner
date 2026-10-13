import type { Ms } from '@/core/model'

/**
 * The playhead is deliberately NOT in React state. Updating it 60 times a second through
 * React would re-render the whole tree. Instead consumers subscribe imperatively
 * (e.g. the stage canvas moves Konva nodes directly) and low-frequency UI reads it on demand.
 */
type Listener = (t: Ms) => void

let current: Ms = 0
const listeners = new Set<Listener>()

export const playhead = {
  get: (): Ms => current,
  set(t: Ms): void {
    const next = Math.max(0, t)
    if (next === current) return
    current = next
    for (const l of listeners) l(current)
  },
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}
