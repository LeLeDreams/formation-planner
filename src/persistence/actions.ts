import { createProject, newId, type Project } from '@/core/model'
import { createSampleProject } from '@/core/sample'
import { ProjectParseError, parseProject } from '@/core/schema'
import * as transport from '@/media/transport'
import { playhead } from '@/store/playheadStore'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { flushSave, friendlySaveError, LAST_PROJECT_KEY, rememberLastProject } from './autosave'
import {
  attachFile,
  canLinkFiles,
  FILE_EXTENSION,
  forgetFile,
  hasLinkedFile,
  pickOpenFile,
  pickSaveFile,
  serializeProject,
  writeLinkedFile,
  type ProjectFileHandle,
} from './fileLink'
import {
  deleteProjectById,
  isEmptyProject,
  listProjects,
  loadProjectById,
  saveProjectRow,
} from './projects'

const current = (): Project => useProjectStore.getState().history.present

/** Reset everything tied to the previous project (playhead, selection, playback). */
export function resetSession(): void {
  transport.stopAll()
  playhead.set(0)
  useUiStore.getState().setSelection([])
}

/**
 * Make `p` the open project. The current one is saved first. If `replaceEmpty` is set and the
 * current project is empty, it is discarded rather than left behind as clutter. `file` links the
 * project to a file on disk; without it, the file it was linked to before (if any) is restored.
 */
async function switchTo(p: Project, replaceEmpty = false, file?: ProjectFileHandle): Promise<void> {
  await flushSave()
  const old = current()
  resetSession()
  useProjectStore.getState().loadProject(p)
  rememberLastProject(p.id)
  await attachFile(p, file, file !== undefined)
  try {
    await saveProjectRow(p)
    useProjectStore.getState().setSaveError(null)
    if (replaceEmpty && old.id !== p.id && isEmptyProject(old)) await deleteProjectById(old.id)
  } catch (err) {
    useProjectStore.getState().setSaveError(friendlySaveError(err))
  }
}

/** Open the last project you worked on (or the most recent one, or a fresh one). */
export async function openInitialProject(): Promise<void> {
  const store = useProjectStore.getState()
  try {
    const tryLoad = async (id: string): Promise<Project | undefined> => {
      try {
        return await loadProjectById(id)
      } catch (err) {
        console.warn(`Skipping project ${id}`, err)
        return undefined
      }
    }
    let project: Project | undefined
    let lastId: string | null = null
    try {
      lastId = localStorage.getItem(LAST_PROJECT_KEY)
    } catch {
      /* storage unavailable */
    }
    if (lastId) project = await tryLoad(lastId)
    if (!project) {
      for (const s of await listProjects()) {
        project = await tryLoad(s.id)
        if (project) break
      }
    }
    if (project) {
      store.loadProject(project)
    } else {
      project = createProject()
      store.loadProject(project)
      await saveProjectRow(project)
    }
    rememberLastProject(project.id)
    await attachFile(project)
  } catch (err) {
    // IndexedDB is unavailable: work in memory and say so.
    console.warn('Could not open saved projects', err)
    store.loadProject(createProject())
    store.setSaveError(friendlySaveError(err))
  }
  // Ask the browser not to evict our stored projects and videos under storage pressure.
  void navigator.storage?.persist?.().catch(() => undefined)
}

export async function newProject(): Promise<void> {
  await switchTo(createProject(), true)
}

export async function openProject(id: string): Promise<void> {
  if (id === current().id) return
  const p = await loadProjectById(id)
  await switchTo(p, true)
}

/** Replace an empty project with the demo routine (or open the demo next to a real project). */
export async function loadSampleProject(): Promise<void> {
  await switchTo(createSampleProject(), true)
}

export async function deleteProject(id: string): Promise<void> {
  await deleteProjectById(id)
  await forgetFile(id)
  if (id !== current().id) return
  const rest = await listProjects()
  if (rest.length) await switchTo(await loadProjectById(rest[0].id))
  else await switchTo(createProject())
}

const slug = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'routine'

const fileNameFor = (p: Project): string => `${slug(p.name)}${FILE_EXTENSION}`

/** Download the project as a .json file you can keep, share, or re-open. */
export function downloadProject(): void {
  const p = current()
  const blob = new Blob([serializeProject(p)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileNameFor(p)
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/**
 * Choose a file on disk for this project. From then on every save also rewrites that file.
 * Browsers that can't do that download a copy instead. Returns false if the user cancelled.
 * Must be called from a click or key press.
 */
export async function saveProjectAs(): Promise<boolean> {
  if (!canLinkFiles()) {
    downloadProject()
    return true
  }
  const picked = await pickSaveFile(fileNameFor(current()))
  if (!picked) return false
  await attachFile(current(), picked, true)
  return true
}

/**
 * Save now. Writes to the project's file, asking where to put it the first time (and asking the
 * browser for permission again if it has lapsed). Must be called from a click or key press.
 */
export async function saveProjectToFile(): Promise<boolean> {
  const p = current()
  if (!hasLinkedFile(p.id)) {
    await flushSave()
    return saveProjectAs()
  }
  const [ok] = await Promise.all([writeLinkedFile(p, true), flushSave()])
  return ok
}

async function adoptParsed(parsed: Project, file?: ProjectFileHandle): Promise<void> {
  await flushSave()
  // Keep the file's identity unless that would overwrite a different project stored here.
  let clash = false
  try {
    clash = serializeProject(await loadProjectById(parsed.id)) !== serializeProject(parsed)
  } catch {
    /* nothing stored under this id (or it is unreadable) */
  }
  await switchTo(clash ? { ...parsed, id: newId('proj') } : parsed, true, file)
}

function importError(err: unknown): string {
  if (err instanceof ProjectParseError) return err.message
  console.warn('Import failed', err)
  return 'Something went wrong opening that file.'
}

/** Open a project file. Returns an error message for the user, or null. */
export async function importProjectFile(file: File): Promise<string | null> {
  let text: string
  try {
    text = await file.text()
  } catch {
    return 'That file couldn’t be read.'
  }
  try {
    await adoptParsed(parseProject(text))
    return null
  } catch (err) {
    return importError(err)
  }
}

/**
 * Pick a project file and open it, staying linked to it so later saves go back into the same
 * file. Returns an error message, null on success, or false if the user cancelled.
 * Must be called from a click or key press.
 */
export async function openProjectFile(): Promise<string | null | false> {
  const picked = await pickOpenFile()
  if (!picked) return false
  let text: string
  try {
    text = await (await picked.getFile()).text()
  } catch {
    return 'That file couldn’t be read.'
  }
  try {
    await adoptParsed(parseProject(text), picked)
    return null
  } catch (err) {
    return importError(err)
  }
}
