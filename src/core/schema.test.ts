import { describe, expect, it } from 'vitest'
import { createProject } from './model'
import { ProjectParseError, parseProject } from './schema'

describe('parseProject', () => {
  it('round-trips a valid project', () => {
    const p = createProject('Test')
    expect(parseProject(JSON.stringify(p))).toEqual(p)
  })
  it('rejects non-JSON with a friendly error', () => {
    expect(() => parseProject('{nope')).toThrow(ProjectParseError)
  })
  it('rejects JSON that is not a project', () => {
    expect(() => parseProject('{"hello":1}')).toThrow(/doesn’t look like/)
  })
  it('rejects newer schema versions', () => {
    const p = { ...createProject(), schemaVersion: 99 }
    expect(() => parseProject(JSON.stringify(p))).toThrow(/newer version/)
  })
  it('reports damaged fields', () => {
    const p = { ...createProject(), stage: { ...createProject().stage, width: -5 } }
    expect(() => parseProject(JSON.stringify(p))).toThrow(/damaged/)
  })
  it('drops positions for dancers that no longer exist and sorts formations', () => {
    const p = createProject()
    p.dancers.push({ id: 'd1', name: 'A', number: 1, color: '#fff' })
    const pos = { x: 0, y: 0, facing: 0, present: true }
    p.formations.push(
      { id: 'b', timeMs: 2000, holdMs: 0, label: '', notes: '', positions: { d1: pos, ghost: pos } },
      { id: 'a', timeMs: 1000, holdMs: 0, label: '', notes: '', positions: { d1: pos } },
    )
    const out = parseProject(JSON.stringify(p))
    expect(out.formations.map((f) => f.id)).toEqual(['a', 'b'])
    expect(Object.keys(out.formations[1].positions)).toEqual(['d1'])
  })
})
