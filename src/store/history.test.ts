import { describe, expect, it } from 'vitest'
import { applyEdit, createHistory, redo, undo } from './history'

interface S {
  n: number
  items: string[]
}
const start = (): S => ({ n: 0, items: [] })

describe('history', () => {
  it('undoes and redoes an edit', () => {
    let h = createHistory(start())
    h = applyEdit(h, 'inc', (d) => void (d.n += 1))
    expect(h.present.n).toBe(1)
    h = undo(h)
    expect(h.present.n).toBe(0)
    h = redo(h)
    expect(h.present.n).toBe(1)
  })

  it('is a no-op (same reference) when nothing changes', () => {
    const h = createHistory(start())
    expect(applyEdit(h, 'noop', (d) => void (d.n = 0))).toBe(h)
  })

  it('clears redo stack after a new edit', () => {
    let h = createHistory(start())
    h = applyEdit(h, 'a', (d) => void (d.n = 1))
    h = undo(h)
    h = applyEdit(h, 'b', (d) => void (d.n = 5))
    expect(h.future).toHaveLength(0)
    expect(redo(h).present.n).toBe(5)
  })

  it('coalesces rapid edits with the same key into one undo step', () => {
    let h = createHistory(start())
    for (let i = 1; i <= 10; i++) {
      h = applyEdit(h, 'drag', (d) => void (d.n = i), { coalesceKey: 'drag', now: 1000 + i * 10 })
    }
    expect(h.past).toHaveLength(1)
    expect(h.present.n).toBe(10)
    h = undo(h)
    expect(h.present.n).toBe(0)
    h = redo(h)
    expect(h.present.n).toBe(10)
  })

  it('does not coalesce after the time window or with a different key', () => {
    let h = createHistory(start())
    h = applyEdit(h, 'drag', (d) => void (d.n = 1), { coalesceKey: 'k', now: 0 })
    h = applyEdit(h, 'drag', (d) => void (d.n = 2), { coalesceKey: 'k', now: 5000 })
    h = applyEdit(h, 'other', (d) => void (d.n = 3), { coalesceKey: 'x', now: 5010 })
    expect(h.past).toHaveLength(3)
  })

  it('handles array edits', () => {
    let h = createHistory(start())
    h = applyEdit(h, 'add', (d) => void d.items.push('a'))
    h = applyEdit(h, 'add', (d) => void d.items.push('b'))
    h = undo(h)
    expect(h.present.items).toEqual(['a'])
    h = undo(h)
    expect(h.present.items).toEqual([])
  })

  it('undo/redo on empty stacks are no-ops', () => {
    const h = createHistory(start())
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})
