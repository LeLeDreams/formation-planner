import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useUiStore } from '@/store/uiStore'
import { Button, Kbd } from './primitives'
import { SHORTCUTS } from './shortcuts'

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.showShortcuts)
  const setOpen = useUiStore((s) => s.setShowShortcuts)
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) closeRef.current?.focus()
  }, [open])

  if (!open) return null
  const groups = [...new Set(SHORTCUTS.map((s) => s.group))]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="max-h-[80vh] w-full max-w-md overflow-auto rounded-xl border border-line bg-panel p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Keyboard shortcuts</h2>
          <Button ref={closeRef} label="Close" onClick={() => setOpen(false)}>
            <X size={16} />
          </Button>
        </div>
        {groups.map((g) => (
          <section key={g} className="mb-4">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{g}</h3>
            <ul className="space-y-1">
              {SHORTCUTS.filter((s) => s.group === g).map((s) => (
                <li key={s.keys + s.description} className="flex items-center justify-between py-1">
                  <span>{s.description}</span>
                  <Kbd>{s.keys}</Kbd>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
