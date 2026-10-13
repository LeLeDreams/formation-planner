import { create } from 'zustand'
import type { Project } from '@/core/model'
import { db } from '@/media/db'

/**
 * A project can be linked to a real file on disk (File System Access API, Chromium browsers).
 * Once linked, every autosave also rewrites that file, so the file is always the latest version.
 * Other browsers have no such API; there "save" downloads a copy instead.
 */

/** The parts of FileSystemFileHandle we use (the permission methods aren't in lib.dom yet). */
export interface ProjectFileHandle {
  readonly name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
  queryPermission?(desc: { mode: 'readwrite' }): Promise<PermissionState>
  requestPermission?(desc: { mode: 'readwrite' }): Promise<PermissionState>
}

interface PickerOptions {
  suggestedName?: string
  types: { description: string; accept: Record<string, string[]> }[]
}

interface PickerWindow {
  showSaveFilePicker?: (opts: PickerOptions) => Promise<ProjectFileHandle>
  showOpenFilePicker?: (opts: PickerOptions) => Promise<ProjectFileHandle[]>
}

export const FILE_EXTENSION = '.formation.json'
const FILE_TYPES: PickerOptions['types'] = [
  { description: 'Formation Planner project', accept: { 'application/json': ['.json'] } },
]

export type FileStatus =
  /** No file linked: the project lives only in this browser. */
  | 'none'
  /** A write to the file is in progress. */
  | 'saving'
  /** The file on disk matches the last save. */
  | 'saved'
  /** Linked, but the browser needs a click before it lets us write to the file again. */
  | 'needs-permission'
  /** The last write to the file failed. */
  | 'error'

interface FileLinkState {
  projectId: string | null
  fileName: string | null
  status: FileStatus
}

const UNLINKED: FileLinkState = { projectId: null, fileName: null, status: 'none' }

export const useFileLinkStore = create<FileLinkState>(() => UNLINKED)

let handle: ProjectFileHandle | null = null

const pickers = (): PickerWindow => window as unknown as PickerWindow

/** True when the browser can save straight to a file on disk and keep it up to date. */
export const canLinkFiles = (): boolean => typeof pickers().showSaveFilePicker === 'function'

export const serializeProject = (p: Project): string => JSON.stringify(p, null, 2)

const errorName = (err: unknown): string =>
  typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : ''

/** The user closed the file picker without choosing anything. */
const isAbort = (err: unknown): boolean => errorName(err) === 'AbortError'

async function hasPermission(h: ProjectFileHandle, ask: boolean): Promise<boolean> {
  try {
    if (!h.queryPermission) return true
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true
    if (!ask || !h.requestPermission) return false
    return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch {
    return false
  }
}

/** Ask where to save. Resolves undefined if the user cancels. */
export async function pickSaveFile(suggestedName: string): Promise<ProjectFileHandle | undefined> {
  try {
    return await pickers().showSaveFilePicker?.({ suggestedName, types: FILE_TYPES })
  } catch (err) {
    if (isAbort(err)) return undefined
    throw err
  }
}

/** Ask which file to open. Resolves undefined if the user cancels. */
export async function pickOpenFile(): Promise<ProjectFileHandle | undefined> {
  try {
    return (await pickers().showOpenFilePicker?.({ types: FILE_TYPES }))?.[0]
  } catch (err) {
    if (isAbort(err)) return undefined
    throw err
  }
}

/**
 * Point the file link at `project` and bring its file up to date. Pass a handle to link a file
 * (it is remembered for next time); pass nothing to restore the file this project was linked to
 * before. `ask` may only be set from a click or key press (see `writeLinkedFile`).
 */
export async function attachFile(project: Project, picked?: ProjectFileHandle, ask = false): Promise<boolean> {
  const projectId = project.id
  let next = picked ?? null
  if (picked) {
    try {
      await db.fileHandles.put({ projectId, handle: picked, name: picked.name })
    } catch (err) {
      // The link still works for this session; it just won't be remembered after a reload.
      console.warn('Could not remember the linked file', err)
    }
  } else {
    try {
      next = (await db.fileHandles.get(projectId))?.handle ?? null
    } catch {
      next = null
    }
  }
  handle = next
  if (!next) {
    useFileLinkStore.setState(UNLINKED)
    return false
  }
  useFileLinkStore.setState({ projectId, fileName: next.name, status: 'saving' })
  return writeLinkedFile(project, ask)
}

/** Forget the file a project was linked to (the file itself is left alone). */
export async function forgetFile(projectId: string): Promise<void> {
  try {
    await db.fileHandles.delete(projectId)
  } catch {
    /* storage unavailable */
  }
  if (useFileLinkStore.getState().projectId === projectId) {
    handle = null
    useFileLinkStore.setState(UNLINKED)
  }
}

let queue: Promise<unknown> = Promise.resolve()

async function write(p: Project, ask: boolean): Promise<boolean> {
  const h = handle
  if (!h || useFileLinkStore.getState().projectId !== p.id) return false
  if (!(await hasPermission(h, ask))) {
    if (handle === h) useFileLinkStore.setState({ status: 'needs-permission' })
    return false
  }
  try {
    const w = await h.createWritable()
    await w.write(serializeProject(p))
    await w.close()
    if (handle === h) useFileLinkStore.setState({ status: 'saved' })
    return true
  } catch (err) {
    console.warn('Could not write the project file', err)
    if (handle === h) {
      const denied = errorName(err) === 'NotAllowedError'
      useFileLinkStore.setState({ status: denied ? 'needs-permission' : 'error' })
    }
    return false
  }
}

/**
 * Write the project to its linked file, if it has one. Writes run one at a time, in order.
 * `ask` may only be set from a click or key press: it lets the browser show its permission prompt.
 */
export function writeLinkedFile(p: Project, ask = false): Promise<boolean> {
  const run = queue.then(() => write(p, ask))
  queue = run.catch(() => undefined)
  return run
}

export const hasLinkedFile = (projectId: string): boolean =>
  handle !== null && useFileLinkStore.getState().projectId === projectId
