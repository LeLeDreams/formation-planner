import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './primitives'

/** A small dropdown menu. Closes on outside click, Escape, or after choosing an item. */
export function Popover({
  label,
  icon,
  text,
  children,
}: {
  label: string
  icon: ReactNode
  text?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <Button label={label} active={open} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        {text && <span className="hidden sm:inline">{text}</span>}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute left-0 top-full z-30 mt-1 min-w-48 rounded-xl border border-line bg-panel p-1 shadow-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({
  icon,
  children,
  onClick,
  disabled,
}: {
  icon?: ReactNode
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-raised disabled:pointer-events-none disabled:opacity-40"
    >
      {icon && <span className="text-muted">{icon}</span>}
      {children}
    </button>
  )
}
