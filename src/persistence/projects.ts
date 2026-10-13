import type { Project } from '@/core/model'
import { parseProject } from '@/core/schema'
import { db } from '@/media/db'

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  dancers: number
  formations: number
}

export async function saveProjectRow(p: Project): Promise<void> {
  await db.projects.put({ id: p.id, name: p.name, updatedAt: new Date().toISOString(), data: p })
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await db.projects.orderBy('updatedAt').reverse().toArray()
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    updatedAt: r.updatedAt,
    dancers: r.data?.dancers?.length ?? 0,
    formations: r.data?.formations?.length ?? 0,
  }))
}

/** Load and validate a stored project. Throws a friendly ProjectParseError if it is damaged. */
export async function loadProjectById(id: string): Promise<Project> {
  const row = await db.projects.get(id)
  if (!row) throw new Error('That project could not be found.')
  return parseProject(JSON.stringify(row.data))
}

export async function deleteProjectById(id: string): Promise<void> {
  await db.projects.delete(id)
}

export const isEmptyProject = (p: Project): boolean => p.dancers.length === 0 && p.formations.length === 0
