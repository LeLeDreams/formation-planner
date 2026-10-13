import { Sparkles, Users } from 'lucide-react'
import { useState } from 'react'
import { formationName } from '@/core/formations'
import { MAX_DANCERS } from '@/core/model'
import { loadSampleProject } from '@/persistence/actions'
import { usePlayheadFormations } from '@/store/hooks'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { Button } from '@/ui/primitives'
import { StageCanvas } from './StageCanvas'
import { StageToolbar } from './StageToolbar'

function EmptyState() {
  const [count, setCount] = useState(8)
  return (
    <div className="absolute inset-0 z-10 grid place-items-center p-4">
      <div className="max-w-xs space-y-4 rounded-2xl border border-line bg-panel/95 p-5 text-center shadow-xl backdrop-blur">
        <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg">
          <Users size={22} />
        </div>
        <div className="space-y-1">
          <p className="text-[15px] font-semibold">Who’s on your team?</p>
          <p className="text-[12px] leading-relaxed text-muted">
            Add your dancers and they’ll appear on stage, ready to drag into formation.
          </p>
        </div>
        <form
          className="flex items-center justify-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            useProjectStore.getState().addDancers(count)
          }}
        >
          <label className="flex items-center gap-2 text-[13px]">
            Dancers
            <input
              type="number"
              min={1}
              max={MAX_DANCERS}
              value={count}
              onChange={(e) => setCount(Math.max(1, Math.min(MAX_DANCERS, Math.round(Number(e.target.value)) || 1)))}
              className="h-8 w-16 rounded-md border border-line bg-panel2 px-2 text-center text-ink"
            />
          </label>
          <Button variant="solid" type="submit">
            Add to stage
          </Button>
        </form>
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <div className="h-px flex-1 bg-line" /> or <div className="h-px flex-1 bg-line" />
        </div>
        <Button variant="subtle" className="w-full" onClick={() => void loadSampleProject()}>
          <Sparkles size={15} /> Load sample routine
        </Button>
      </div>
    </div>
  )
}

/** Tells the user which formation they are editing, and what happens if they move someone. */
function StatusChip() {
  const formations = useProjectStore((s) => selectProject(s).formations)
  const { index, exact } = usePlayheadFormations()
  if (!formations.length) return null
  let text: string
  if (exact >= 0) text = `Editing “${formationName(formations[exact], exact)}”`
  else if (index >= 0) text = `Between formations · moving a dancer adds one here`
  else text = 'Before the first formation'
  return (
    <div
      className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[80%] truncate rounded-full border border-line bg-panel/95 px-3 py-1 text-[12px] text-ink shadow-sm"
      aria-live="polite"
    >
      <span className={exact >= 0 ? 'text-accent-strong' : 'text-muted'}>{text}</span>
    </div>
  )
}

export function StagePanel({ overlay = false }: { overlay?: boolean }) {
  const dancerCount = useProjectStore((s) => selectProject(s).dancers.length)
  return (
    <div className={overlay ? 'absolute inset-0' : 'flex h-full flex-col'}>
      {overlay ? (
        <StageToolbar floating />
      ) : (
        <div className="flex h-9 shrink-0 items-center border-b border-line px-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Stage</h2>
        </div>
      )}
      {!overlay && <StageToolbar />}
      <div className={overlay ? 'absolute inset-0' : 'relative min-h-0 flex-1'}>
        <StageCanvas overlay={overlay} />
        {dancerCount === 0 && <EmptyState />}
        <StatusChip />
      </div>
    </div>
  )
}
