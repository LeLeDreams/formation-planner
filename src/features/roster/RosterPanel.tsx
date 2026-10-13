import clsx from 'clsx'
import { Plus, Trash2, Users } from 'lucide-react'
import { useState } from 'react'
import { MAX_DANCERS } from '@/core/model'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { readableInk } from '@/core/color'
import { Button, PanelHeader, TextInput } from '@/ui/primitives'

export function RosterPanel() {
  const dancers = useProjectStore((s) => selectProject(s).dancers)
  const { addDancer, addDancers, updateDancer, removeDancer } = useProjectStore.getState()
  const selected = useUiStore((s) => s.selectedDancerIds)
  const setSelection = useUiStore((s) => s.setSelection)
  const [more, setMore] = useState(4)
  const room = MAX_DANCERS - dancers.length
  const addOne = () => {
    const id = addDancer()
    if (id) setSelection([id])
  }

  return (
    <aside aria-label="Dancer roster" className="flex h-full w-64 shrink-0 flex-col border-r border-line bg-panel">
      <PanelHeader title={`Dancers (${dancers.length})`}>
        <Button label="Add dancer" disabled={room <= 0} onClick={addOne}>
          <Plus size={16} />
        </Button>
      </PanelHeader>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {dancers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center text-muted">
            <Users size={28} />
            <p>No dancers yet. Add your team to start placing them on stage.</p>
            <Button variant="solid" onClick={addOne}>
              <Plus size={16} /> Add dancer
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {dancers.map((d) => {
              const isSel = selected.includes(d.id)
              return (
                <li
                  key={d.id}
                  className={clsx(
                    'flex items-center gap-2 rounded-lg border p-1.5',
                    isSel ? 'border-accent-strong bg-raised' : 'border-transparent hover:bg-panel2',
                  )}
                >
                  <button
                    type="button"
                    aria-label={`Select ${d.name}`}
                    aria-pressed={isSel}
                    onClick={(e) =>
                      setSelection(
                        e.shiftKey
                          ? isSel
                            ? selected.filter((x) => x !== d.id)
                            : [...selected, d.id]
                          : [d.id],
                      )
                    }
                    className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold"
                    style={{ background: d.color, color: readableInk(d.color) }}
                  >
                    {d.number}
                  </button>
                  <TextInput
                    aria-label={`Name for dancer ${d.number}`}
                    className="min-w-0 flex-1 border-transparent bg-transparent px-1.5 hover:border-line"
                    value={d.name}
                    onChange={(e) => updateDancer(d.id, { name: e.target.value })}
                  />
                  <input
                    type="color"
                    aria-label={`Color for ${d.name}`}
                    value={d.color}
                    onChange={(e) => updateDancer(d.id, { color: e.target.value })}
                    className="size-6 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
                  />
                  <Button
                    label={`Remove ${d.name}`}
                    className="size-7 px-0"
                    onClick={() => {
                      removeDancer(d.id)
                      setSelection(selected.filter((x) => x !== d.id))
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {dancers.length > 0 && (
        <form
          className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2 text-[12px] text-muted"
          onSubmit={(e) => {
            e.preventDefault()
            addDancers(Math.min(more, room))
          }}
        >
          {room > 0 ? (
            <>
              <label className="flex items-center gap-2">
                Add
                <input
                  type="number"
                  min={1}
                  max={room}
                  value={Math.min(more, room)}
                  aria-label="How many dancers to add"
                  onChange={(e) => setMore(Math.max(1, Math.min(room, Math.round(Number(e.target.value)) || 1)))}
                  className="h-7 w-14 rounded-md border border-line bg-panel2 px-1.5 text-center text-ink"
                />
                more
              </label>
              <Button variant="subtle" type="submit" className="ml-auto h-7">
                Add
              </Button>
            </>
          ) : (
            <span>That’s the maximum of {MAX_DANCERS} dancers.</span>
          )}
        </form>
      )}
    </aside>
  )
}
