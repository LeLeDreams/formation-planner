import clsx from 'clsx'
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'

type BtnProps = ComponentProps<'button'> & {
  variant?: 'ghost' | 'solid' | 'subtle'
  active?: boolean
  /** Required for icon-only buttons so they are accessible. */
  label?: string
}

export function Button({ variant = 'ghost', active, label, className, children, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={clsx(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-[13px] font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-40',
        variant === 'ghost' && 'text-muted hover:bg-raised hover:text-ink',
        variant === 'subtle' && 'bg-raised text-ink hover:bg-line',
        variant === 'solid' && 'bg-accent text-accent-fg hover:brightness-110',
        active && 'bg-raised text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <input
      className={clsx(
        'h-8 w-full rounded-md border border-line bg-panel2 px-2 text-[13px] text-ink',
        'placeholder:text-muted focus:border-accent focus:outline-none',
        className,
      )}
      {...rest}
    />
  )
}

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-line px-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
      <div className="flex items-center gap-1">{children}</div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] text-ink">
      {children}
    </kbd>
  )
}

const fmtNumber = (v: number): string => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100))

/**
 * A number input that lets you type freely (including "-" or "1.") and commits every valid
 * value as you go. Arrow keys step the value. The field re-syncs from the app when not focused.
 */
export function NumberField({
  label,
  value,
  onCommit,
  step = 1,
  min,
  max,
  suffix,
  disabled,
}: {
  label: string
  value: number
  onCommit: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  disabled?: boolean
}) {
  const [text, setText] = useState(fmtNumber(value))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setText(fmtNumber(value))
  }, [value])

  const clampTo = (n: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n))
  const commit = (n: number) => onCommit(clampTo(n))

  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
      <span className="relative block">
        <input
          inputMode="decimal"
          disabled={disabled}
          value={text}
          aria-label={label}
          className="h-8 w-full rounded-md border border-line bg-panel2 px-2 pr-7 text-[13px] tabular-nums text-ink focus:border-accent-strong focus:outline-none disabled:opacity-50"
          onFocus={() => (focused.current = true)}
          onBlur={() => {
            focused.current = false
            setText(fmtNumber(value))
          }}
          onChange={(e) => {
            setText(e.target.value)
            const n = parseFloat(e.target.value)
            if (Number.isFinite(n)) commit(n)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              e.stopPropagation()
              const next = clampTo(value + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1))
              setText(fmtNumber(next))
              onCommit(next)
            } else if (e.key === 'Enter') {
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[11px] text-muted">
            {suffix}
          </span>
        )}
      </span>
    </label>
  )
}
