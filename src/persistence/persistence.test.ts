// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { createSampleProject } from '@/core/sample'
import { db } from '@/media/db'
import { useProjectStore } from '@/store/projectStore'
import { flushSave } from './autosave'
import { deleteProjectById, listProjects, loadProjectById, saveProjectRow } from './projects'

beforeEach(async () => {
  await db.projects.clear()
})

describe('project persistence', () => {
  it('round-trips a project through IndexedDB', async () => {
    const p = createSampleProject()
    await saveProjectRow(p)
    const back = await loadProjectById(p.id)
    expect(back.dancers).toHaveLength(p.dancers.length)
    expect(back.formations).toHaveLength(p.formations.length)
    expect(back.formations[1].positions).toEqual(JSON.parse(JSON.stringify(p.formations[1].positions)))
  })

  it('lists summaries, newest first, and deletes', async () => {
    const a = createSampleProject()
    await saveProjectRow(a)
    await new Promise((r) => setTimeout(r, 5))
    const b = { ...createSampleProject(), id: 'other', name: 'Second' }
    await saveProjectRow(b)
    const list = await listProjects()
    expect(list.map((s) => s.id)).toEqual(['other', a.id])
    expect(list[0].dancers).toBe(8)
    await deleteProjectById('other')
    expect(await listProjects()).toHaveLength(1)
  })

  it('refuses a damaged row with a friendly error instead of crashing', async () => {
    await db.projects.put({ id: 'bad', name: 'bad', updatedAt: new Date().toISOString(), data: { nope: 1 } as never })
    await expect(loadProjectById('bad')).rejects.toThrow()
  })

  it('flushSave writes the current edits and clears the dirty flag', async () => {
    const s = useProjectStore.getState()
    s.loadProject(createSampleProject())
    s.setName('Saved by flush')
    expect(useProjectStore.getState().dirty).toBe(true)
    await flushSave()
    expect(useProjectStore.getState().dirty).toBe(false)
    const id = useProjectStore.getState().history.present.id
    expect((await loadProjectById(id)).name).toBe('Saved by flush')
  })
})
