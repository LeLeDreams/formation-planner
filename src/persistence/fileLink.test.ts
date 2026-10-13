// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createProject, type Project } from '@/core/model'
import { createSampleProject } from '@/core/sample'
import { db } from '@/media/db'
import { useProjectStore } from '@/store/projectStore'
import { newProject, openProjectFile, saveProjectAs, saveProjectToFile } from './actions'
import { flushSave } from './autosave'
import { attachFile, serializeProject, useFileLinkStore, type ProjectFileHandle } from './fileLink'
import { listProjects, saveProjectRow } from './projects'

interface FakeFile {
  text: string
  writes: number
  permission: PermissionState
  /** What the user answers when the browser asks for permission. */
  answer: PermissionState
  handle: ProjectFileHandle
}

/** An in-memory stand-in for a file on disk. */
function fakeFile(name: string, text = '', permission: PermissionState = 'granted'): FakeFile {
  const file: FakeFile = {
    text,
    writes: 0,
    permission,
    answer: 'granted',
    handle: {
      name,
      getFile: async () => new File([file.text], name),
      createWritable: async () => {
        let pending = ''
        return {
          write: async (data: string) => void (pending = data),
          close: async () => {
            file.text = pending
            file.writes++
          },
        }
      },
      queryPermission: async () => file.permission,
      requestPermission: async () => (file.permission = file.answer),
    },
  }
  return file
}

const win = window as unknown as Record<string, unknown>
const current = (): Project => useProjectStore.getState().history.present
const link = () => useFileLinkStore.getState()

beforeEach(async () => {
  // The fake handles can't be stored in IndexedDB (real ones can), which only logs a warning.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  await db.projects.clear()
  await db.fileHandles.clear()
  const p = createSampleProject()
  useProjectStore.getState().loadProject(p)
  await attachFile(p)
})

afterEach(() => {
  delete win.showSaveFilePicker
  delete win.showOpenFilePicker
  vi.restoreAllMocks()
})

describe('saving to a file on disk', () => {
  it('starts out saved in the browser only', () => {
    expect(link().status).toBe('none')
    expect(link().fileName).toBeNull()
  })

  it('“Save as” writes the project to the chosen file and reports it', async () => {
    const file = fakeFile('show.formation.json')
    win.showSaveFilePicker = vi.fn(async () => file.handle)
    expect(await saveProjectAs()).toBe(true)
    expect(win.showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: 'sample-routine.formation.json' }),
    )
    expect(file.text).toBe(serializeProject(current()))
    expect(link()).toMatchObject({ status: 'saved', fileName: 'show.formation.json', projectId: current().id })
  })

  it('keeps the file up to date on every autosave after that', async () => {
    const file = fakeFile('show.formation.json')
    win.showSaveFilePicker = async () => file.handle
    await saveProjectAs()
    useProjectStore.getState().setName('Renamed')
    await flushSave()
    expect(JSON.parse(file.text).name).toBe('Renamed')
    expect(useProjectStore.getState().dirty).toBe(false)
  })

  it('cancelling the picker changes nothing', async () => {
    win.showSaveFilePicker = async () => {
      throw new DOMException('cancelled', 'AbortError')
    }
    expect(await saveProjectAs()).toBe(false)
    expect(link().status).toBe('none')
  })

  it('never claims the file is saved while the browser withholds permission', async () => {
    const file = fakeFile('show.formation.json')
    win.showSaveFilePicker = async () => file.handle
    await saveProjectAs()
    // After a reload the browser wants to be asked again.
    file.permission = 'prompt'
    useProjectStore.getState().setName('Edited later')
    await flushSave()
    expect(link().status).toBe('needs-permission')
    expect(JSON.parse(file.text).name).not.toBe('Edited later')
    // The edit is still safe in the browser.
    expect((await listProjects())[0].name).toBe('Edited later')

    // Pressing Save (a user gesture) lets the browser ask, and the file catches up.
    expect(await saveProjectToFile()).toBe(true)
    expect(link().status).toBe('saved')
    expect(JSON.parse(file.text).name).toBe('Edited later')
  })

  it('stays disconnected if the user refuses permission', async () => {
    const file = fakeFile('show.formation.json')
    win.showSaveFilePicker = async () => file.handle
    await saveProjectAs()
    file.permission = 'prompt'
    file.answer = 'denied'
    expect(await saveProjectToFile()).toBe(false)
    expect(link().status).toBe('needs-permission')
  })

  it('reports a failed write', async () => {
    const file = fakeFile('show.formation.json')
    win.showSaveFilePicker = async () => file.handle
    await saveProjectAs()
    file.handle.createWritable = async () => {
      throw new Error('disk full')
    }
    useProjectStore.getState().setName('Will not reach the file')
    await flushSave()
    expect(link().status).toBe('error')
  })

  it('Save asks where to put the file the first time, then reuses it', async () => {
    const file = fakeFile('show.formation.json')
    const picker = vi.fn(async () => file.handle)
    win.showSaveFilePicker = picker
    await saveProjectToFile()
    await saveProjectToFile()
    expect(picker).toHaveBeenCalledTimes(1)
    expect(file.writes).toBeGreaterThanOrEqual(2)
  })

  it('a different project does not write into the previous project’s file', async () => {
    const file = fakeFile('show.formation.json')
    win.showSaveFilePicker = async () => file.handle
    await saveProjectAs()
    const before = file.text
    await newProject()
    expect(link().status).toBe('none')
    useProjectStore.getState().setName('Another routine')
    await flushSave()
    expect(file.text).toBe(before)
  })
})

describe('opening a file from disk', () => {
  it('opens the project and stays linked, so saves go back into the same file', async () => {
    const source = { ...createSampleProject(), id: 'proj_fromdisk', name: 'From disk' }
    const file = fakeFile('from-disk.formation.json', serializeProject(source), 'prompt')
    win.showOpenFilePicker = async () => [file.handle]
    expect(await openProjectFile()).toBeNull()
    expect(current().id).toBe('proj_fromdisk')
    expect(current().dancers).toHaveLength(source.dancers.length)
    expect(link()).toMatchObject({ status: 'saved', fileName: 'from-disk.formation.json' })

    useProjectStore.getState().setName('Edited after opening')
    await flushSave()
    expect(JSON.parse(file.text).name).toBe('Edited after opening')
  })

  it('opens as a copy rather than overwrite a different project stored under the same id', async () => {
    const stored = { ...createSampleProject(), id: 'proj_same', name: 'Newer, in the browser' }
    await saveProjectRow(stored)
    const file = fakeFile('old.formation.json', serializeProject({ ...stored, name: 'Older, on disk' }))
    win.showOpenFilePicker = async () => [file.handle]
    await openProjectFile()
    expect(current().id).not.toBe('proj_same')
    expect(current().name).toBe('Older, on disk')
    const names = (await listProjects()).map((s) => s.name)
    expect(names).toContain('Newer, in the browser')
    expect(names).toContain('Older, on disk')
  })

  it('reopening an unchanged file does not pile up copies', async () => {
    const stored = { ...createProject('Same'), id: 'proj_same' }
    await saveProjectRow(stored)
    const file = fakeFile('same.formation.json', serializeProject(stored))
    win.showOpenFilePicker = async () => [file.handle]
    await openProjectFile()
    expect(current().id).toBe('proj_same')
    expect((await listProjects()).filter((s) => s.name === 'Same')).toHaveLength(1)
  })

  it('gives a friendly message for a file that is not a project', async () => {
    const file = fakeFile('notes.json', '{"hello": 1}')
    win.showOpenFilePicker = async () => [file.handle]
    const before = current().id
    expect(typeof (await openProjectFile())).toBe('string')
    expect(current().id).toBe(before)
  })

  it('cancelling the picker resolves to false', async () => {
    win.showOpenFilePicker = async () => {
      throw new DOMException('cancelled', 'AbortError')
    }
    expect(await openProjectFile()).toBe(false)
  })
})
