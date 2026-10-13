import { Copy, MousePointer2, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import { describePosition } from '@/core/describe'
import { EASING_LABELS } from '@/core/easing'
import { formationName, withPresence } from '@/core/formations'
import { effectiveHold, getDancerStateAt, getTransition } from '@/core/interpolate'
import type { DancerId, DancerState, EasingName, Level } from '@/core/model'
import { normAngle } from '@/core/stage'
import { CenterTimePanel } from '@/features/center/CenterTimePanel'
import {
  addFormationHere,
  deleteCurrentFormation,
  duplicateCurrentFormation,
} from '@/features/timeline/formationActions'
import { usePlayheadFormations, usePlayheadTime } from '@/store/hooks'
import { playhead } from '@/store/playheadStore'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore, type RightTab } from '@/store/uiStore'
import { Button, NumberField, TextInput } from '@/ui/primitives'

const Label = ({ children }: { children: React.ReactNode }) => (
  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">{children}</span>
)

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <h3 className="text-[12px] font-semibold text-ink">{title}</h3>
    {children}
  </section>
)

const LEVELS: { value: Level | ''; label: string }[] = [
  { value: '', label: 'Not set' },
  { value: 'low', label: 'Low' },
  { value: 'mid', label: 'Mid' },
  { value: 'high', label: 'High' },
]

/** Edit a pose at the playhead; this adds a formation there if the playhead is between two. */
function setPose(ids: DancerId[], patch: Partial<DancerState>, key: string) {
  const patches: Record<DancerId, Partial<DancerState>> = {}
  for (const id of ids) patches[id] = patch
  useProjectStore.getState().setPoses(playhead.get(), patches, 'Edit dancer', { coalesceKey: key })
}

function FormationSection() {
  const project = useProjectStore(selectProject)
  const { formations, transitions } = project
  const { index, exact } = usePlayheadFormations()
  const { updateFormation, setFormationTime, setFormationHold, setTransitionEasing } = useProjectStore.getState()

  if (!formations.length) return null
  const i = exact >= 0 ? exact : Math.max(0, index)
  const f = formations[i]
  const next = formations[i + 1]
  const easing = getTransition(transitions, f.id)?.easing ?? 'easeInOut'
  const hold = effectiveHold(formations, i)
  const gap = next ? next.timeMs - f.timeMs : undefined
  const sec = (ms: number) => Math.round(ms / 10) / 100

  return (
    <Section title={`Formation ${i + 1} of ${formations.length}`}>
      {exact < 0 && (
        <div className="space-y-2 rounded-lg bg-panel2 p-2.5 text-[12px] text-muted">
          <p>The playhead is between formations. Moving a dancer will add a new one here.</p>
          <Button variant="subtle" className="h-7" onClick={addFormationHere}>
            <Plus size={14} /> Add formation here
          </Button>
        </div>
      )}
      <label className="block">
        <Label>Label</Label>
        <TextInput value={f.label} placeholder={`Formation ${i + 1}`} onChange={(e) => updateFormation(f.id, { label: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Starts at"
          suffix="sec"
          step={0.1}
          min={0}
          value={Math.round(f.timeMs) / 1000}
          onCommit={(s) => setFormationTime(f.id, s * 1000)}
        />
        <NumberField
          label="Held for"
          suffix="sec"
          step={0.1}
          min={0}
          max={gap === undefined ? undefined : gap / 1000}
          value={sec(hold)}
          onCommit={(s) => setFormationHold(f.id, s * 1000)}
        />
      </div>
      <p className="-mt-1 text-[12px] leading-snug text-muted">
        {gap === undefined
          ? 'How long the dancers stay in this formation.'
          : gap - hold > 0
            ? `Dancers stay here for ${sec(hold)} s, then take ${sec(gap - hold)} s to move to “${formationName(next!, i + 1)}”, which starts ${sec(gap)} s after this one.`
            : `Dancers stay here until “${formationName(next!, i + 1)}” starts, then jump straight to it. Move that formation later to make room.`}
      </p>
      <label className="block">
        <Label>Notes</Label>
        <textarea
          rows={3}
          value={f.notes}
          placeholder="Counts, cues, reminders…"
          onChange={(e) => updateFormation(f.id, { notes: e.target.value })}
          className="w-full resize-y rounded-md border border-line bg-panel2 px-2 py-1.5 text-[13px] text-ink placeholder:text-muted focus:border-accent-strong focus:outline-none"
        />
      </label>
      {next && (
        <label className="block">
          <Label>Movement to “{formationName(next, i + 1)}”</Label>
          <select
            value={easing}
            onChange={(e) => setTransitionEasing(f.id, e.target.value as EasingName)}
            className="h-8 w-full rounded-md border border-line bg-panel2 px-2 text-[13px] text-ink"
          >
            {(Object.keys(EASING_LABELS) as EasingName[]).map((k) => (
              <option key={k} value={k}>
                {EASING_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <Button variant="subtle" disabled={exact < 0} onClick={duplicateCurrentFormation}>
          <Copy size={14} /> Duplicate
        </Button>
        <Button
          variant="subtle"
          disabled={exact < 0 || formations.length <= 1}
          label={formations.length <= 1 ? 'At least one formation is needed' : 'Delete this formation'}
          onClick={deleteCurrentFormation}
        >
          <Trash2 size={14} /> Delete
        </Button>
      </div>
    </Section>
  )
}

function DancerSection() {
  const project = useProjectStore(selectProject)
  const selectedIds = useUiStore((s) => s.selectedDancerIds)
  const t = usePlayheadTime()
  const { updateDancer } = useProjectStore.getState()
  const dancers = project.dancers.filter((d) => selectedIds.includes(d.id))

  if (dancers.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-muted">
        <MousePointer2 size={26} />
        <p>Select a dancer on the stage to edit their position and facing.</p>
      </div>
    )
  }

  const ids = dancers.map((d) => d.id)
  const states = dancers.map((d) => getDancerStateAt(project, d.id, t))
  const first = states[0]
  // "On stage" follows what you see: a dancer fading in or out counts as on stage once half visible.
  const firstOn = (first?.opacity ?? 1) >= 0.5
  const one = dancers.length === 1 ? dancers[0] : null
  const { units } = project.stage

  return (
    <Section title={one ? one.name : `${dancers.length} dancers selected`}>
      {one && (
        <div className="grid grid-cols-[1fr_5rem] gap-2">
          <label className="block">
            <Label>Name</Label>
            <TextInput value={one.name} onChange={(e) => updateDancer(one.id, { name: e.target.value })} />
          </label>
          <NumberField
            label="Number"
            min={0}
            max={999}
            value={one.number}
            onCommit={(n) => updateDancer(one.id, { number: Math.round(n) })}
          />
        </div>
      )}
      {one && first && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="X · across"
              suffix={units}
              step={0.5}
              value={first.x}
              onCommit={(x) => setPose(ids, { x }, `x:${one.id}`)}
            />
            <NumberField
              label="Y · depth"
              suffix={units}
              step={0.5}
              value={first.y}
              onCommit={(y) => setPose(ids, { y }, `y:${one.id}`)}
            />
          </div>
          <p className="-mt-1 text-[12px] leading-snug text-muted">
            {describePosition(first.x, first.y, units, firstOn)}
          </p>
        </>
      )}
      {first && (
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Facing"
            suffix="°"
            step={15}
            value={Math.round(first.facing)}
            onCommit={(deg) => setPose(ids, { facing: normAngle(deg) }, `facing:${ids.join()}`)}
          />
          <label className="block">
            <Label>Level</Label>
            <select
              value={first.level ?? ''}
              onChange={(e) => {
                const v = e.target.value as Level | ''
                setPose(ids, { level: v === '' ? undefined : v }, `level:${ids.join()}`)
              }}
              className="h-8 w-full rounded-md border border-line bg-panel2 px-2 text-[13px] text-ink"
            >
              {LEVELS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {first && (
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent-strong)]"
            checked={firstOn}
            onChange={(e) => {
              const present = e.target.checked
              const patches: Record<DancerId, Partial<DancerState>> = {}
              dancers.forEach((d, k) => {
                const st = states[k]
                if (st) patches[d.id] = withPresence(st, present, project.stage)
              })
              useProjectStore.getState().setPoses(playhead.get(), patches, present ? 'Bring on stage' : 'Take offstage')
            }}
          />
          On stage
          <span className="text-[12px] text-muted">(untick to exit into the wings)</span>
        </label>
      )}
    </Section>
  )
}

const TABS: { id: RightTab; label: string }[] = [
  { id: 'inspector', label: 'Inspector' },
  { id: 'center', label: 'Center time' },
]

export function InspectorPanel() {
  const tab = useUiStore((s) => s.rightTab)
  const setTab = useUiStore((s) => s.setRightTab)
  return (
    <aside aria-label="Inspector" className="flex h-full w-72 shrink-0 flex-col border-l border-line bg-panel">
      <div role="tablist" aria-label="Right panel" className="flex h-10 shrink-0 items-stretch gap-1 border-b border-line px-2">
        {TABS.map((x) => (
          <button
            key={x.id}
            type="button"
            role="tab"
            id={`right-tab-${x.id}`}
            aria-selected={tab === x.id}
            aria-controls="right-tabpanel"
            onClick={() => setTab(x.id)}
            className={clsx(
              '-mb-px border-b-2 px-2 text-[11px] font-semibold uppercase tracking-wider',
              tab === x.id ? 'border-accent-strong text-ink' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="right-tabpanel"
        aria-labelledby={`right-tab-${tab}`}
        className="min-h-0 flex-1 space-y-6 overflow-auto p-3"
      >
        {tab === 'center' ? (
          <CenterTimePanel />
        ) : (
          <>
            <DancerSection />
            <FormationSection />
          </>
        )}
      </div>
    </aside>
  )
}
