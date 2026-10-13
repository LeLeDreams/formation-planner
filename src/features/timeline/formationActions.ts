import { formationIndexAt } from '@/core/formations'
import * as transport from '@/media/transport'
import { playhead } from '@/store/playheadStore'
import { useProjectStore } from '@/store/projectStore'

const formations = () => useProjectStore.getState().history.present.formations

/** Add a formation at the playhead (or a copy later on, if the playhead is on one already). */
export function addFormationHere(): void {
  const id = useProjectStore.getState().addFormationAtTime(playhead.get())
  const f = formations().find((x) => x.id === id)
  if (f) transport.seek(f.timeMs)
}

export function duplicateCurrentFormation(): void {
  const i = formationIndexAt(formations(), playhead.get())
  if (i < 0) return
  const id = useProjectStore.getState().duplicateFormation(formations()[i].id)
  const f = formations().find((x) => x.id === id)
  if (f) transport.seek(f.timeMs)
}

export function deleteCurrentFormation(): void {
  const i = formationIndexAt(formations(), playhead.get())
  if (i < 0 || formations().length <= 1) return
  useProjectStore.getState().deleteFormation(formations()[i].id)
}
