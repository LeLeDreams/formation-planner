import { align, arrange, defaultSpacing, distribute, transformGroup, type AlignKind, type ArrangeKind } from '@/core/arrange'
import { getFrameAt } from '@/core/interpolate'
import type { DancerId, Vec2 } from '@/core/model'
import { floorBounds, fromView, normAngle, toView } from '@/core/stage'
import { playhead } from '@/store/playheadStore'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'

interface Target {
  t: number
  items: { id: DancerId; x: number; y: number; facing: number }[]
  /** True when nothing was selected, so the action applies to everyone on stage. */
  all: boolean
}

/** The selected dancers (or everyone on stage if none are selected), at the playhead. */
export function currentTarget(): Target {
  const proj = useProjectStore.getState().history.present
  const sel = useUiStore.getState().selectedDancerIds.filter((id) => proj.dancers.some((d) => d.id === id))
  const t = playhead.get()
  const frame = getFrameAt(proj, t)
  const ids = sel.length ? sel : proj.dancers.map((d) => d.id)
  const items = ids
    .filter((id) => frame[id] && frame[id].opacity > 0.5)
    .map((id) => ({ id, x: frame[id].x, y: frame[id].y, facing: frame[id].facing }))
  return { t, items, all: sel.length === 0 }
}

function commit(t: number, label: string, pos: Record<DancerId, Vec2>, facing?: Record<DancerId, number>) {
  const patches: Record<DancerId, { x: number; y: number; facing?: number }> = {}
  for (const [id, p] of Object.entries(pos)) {
    patches[id] = { x: p.x, y: p.y, ...(facing ? { facing: normAngle(facing[id]) } : {}) }
  }
  useProjectStore.getState().setPoses(t, patches, label)
}

export function arrangeTarget(kind: ArrangeKind): void {
  const { t, items } = currentTarget()
  if (!items.length) return
  const proj = useProjectStore.getState().history.present
  const out = arrange(kind, items, {
    spacing: defaultSpacing(proj.settings.minDistance),
    bounds: floorBounds(proj.stage),
  })
  commit(t, `Arrange as ${kind}`, out)
}

export function alignTarget(kind: AlignKind): void {
  const { t, items } = currentTarget()
  if (items.length < 2) return
  const side = useProjectStore.getState().history.present.stage.audienceSide
  // "Left" and "top" mean left and top on screen, whichever way the stage is turned.
  const view = items.map((i) => ({ id: i.id, ...toView(i, side) }))
  const out = align(view, kind)
  commit(t, 'Align dancers', mapBack(out, side))
}

export function distributeTarget(axis: 'horizontal' | 'vertical'): void {
  const { t, items } = currentTarget()
  if (items.length < 3) return
  const side = useProjectStore.getState().history.present.stage.audienceSide
  const view = items.map((i) => ({ id: i.id, ...toView(i, side) }))
  const out = distribute(view, axis === 'horizontal' ? 'x' : 'y')
  commit(t, 'Distribute dancers', mapBack(out, side))
}

export function rotateTarget(deg: number): void {
  const { t, items } = currentTarget()
  if (!items.length) return
  const out = transformGroup(items, { rotateDeg: deg })
  const facing: Record<DancerId, number> = {}
  for (const i of items) facing[i.id] = i.facing + deg
  commit(t, 'Rotate dancers', out, facing)
}

export function scaleTarget(factor: number): void {
  const { t, items } = currentTarget()
  if (!items.length) return
  commit(t, 'Scale formation', transformGroup(items, { scale: factor }))
}

function mapBack(out: Record<DancerId, Vec2>, side: Parameters<typeof fromView>[1]): Record<DancerId, Vec2> {
  const res: Record<DancerId, Vec2> = {}
  for (const [id, p] of Object.entries(out)) res[id] = fromView(p, side)
  return res
}
