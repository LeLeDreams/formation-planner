import Dexie, { type EntityTable } from 'dexie'
import type { Project } from '@/core/model'
import type { ProjectFileHandle } from '@/persistence/fileLink'

export interface MediaRow {
  hash: string
  blob: Blob
  name: string
  size: number
  mimeType: string
  savedAt: number
}

export interface ProjectRow {
  id: string
  name: string
  /** ISO timestamp of the last save; indexed so the list can sort by it. */
  updatedAt: string
  data: Project
}

export interface FileHandleRow {
  projectId: string
  /** The FileSystemFileHandle of the file on disk this project saves to. */
  handle: ProjectFileHandle
  name: string
}

/**
 * Local-first storage. Project JSON and media blobs live in IndexedDB; a project only
 * references its video by content hash.
 */
export const db = new Dexie('formation-planner') as Dexie & {
  media: EntityTable<MediaRow, 'hash'>
  projects: EntityTable<ProjectRow, 'id'>
  fileHandles: EntityTable<FileHandleRow, 'projectId'>
}
db.version(1).stores({ media: 'hash' })
db.version(2).stores({ media: 'hash', projects: 'id, updatedAt' })
db.version(3).stores({ media: 'hash', projects: 'id, updatedAt', fileHandles: 'projectId' })

export async function saveMedia(hash: string, file: File): Promise<boolean> {
  try {
    await db.media.put({
      hash,
      blob: file,
      name: file.name,
      size: file.size,
      mimeType: file.type,
      savedAt: Date.now(),
    })
    return true
  } catch (err) {
    // Quota exceeded or storage blocked (private mode). The video still works this session.
    console.warn('Could not store media for next time', err)
    return false
  }
}

export async function loadMedia(hash: string): Promise<File | undefined> {
  try {
    const row = await db.media.get(hash)
    if (!row) return undefined
    return new File([row.blob], row.name, { type: row.mimeType })
  } catch (err) {
    console.warn('Could not read stored media', err)
    return undefined
  }
}
