import { z } from 'zod'
import { SCHEMA_VERSION, type Project } from './model'

const finite = z.number().refine(Number.isFinite, 'must be a finite number')

const mediaRef = z.object({
  hash: z.string(),
  name: z.string(),
  size: finite,
  mimeType: z.string(),
  durationMs: finite.optional(),
})

const dancerState = z.object({
  x: finite,
  y: finite,
  facing: finite,
  level: z.enum(['low', 'mid', 'high']).optional(),
  present: z.boolean(),
})

const vec2 = z.object({ x: finite, y: finite })
const easing = z.enum(['linear', 'easeInOut', 'easeIn', 'easeOut', 'hold'])

export const projectSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stage: z.object({
    width: finite.refine((n) => n > 0),
    depth: finite.refine((n) => n > 0),
    units: z.enum(['ft', 'm']),
    audienceSide: z.enum(['bottom', 'top', 'left', 'right']),
    wingDepth: finite.refine((n) => n >= 0),
    backdropImage: mediaRef.optional(),
  }),
  media: z.object({ video: mediaRef.optional(), youtubeUrl: z.string().optional() }),
  dancers: z.array(
    z.object({ id: z.string(), name: z.string(), number: finite, color: z.string() }),
  ),
  formations: z.array(
    z.object({
      id: z.string(),
      timeMs: finite.refine((n) => n >= 0),
      holdMs: finite.refine((n) => n >= 0),
      label: z.string(),
      notes: z.string(),
      positions: z.record(z.string(), dancerState),
    }),
  ),
  transitions: z.array(
    z.object({
      fromFormationId: z.string(),
      easing,
      perDancer: z.record(
        z.string(),
        z.object({
          path: z.enum(['straight', 'curved']),
          control: vec2.optional(),
          delayFrac: finite.optional(),
        }),
      ),
    }),
  ),
  sections: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['intro', 'verse', 'chorus', 'bridge', 'outro', 'custom']),
      label: z.string(),
      startMs: finite,
      endMs: finite,
      color: z.string(),
    }),
  ),
  settings: z.object({
    minDistance: finite,
    snapToGrid: z.boolean(),
    gridSize: finite.refine((n) => n > 0),
  }),
})

export class ProjectParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProjectParseError'
  }
}

type Migration = (json: Record<string, unknown>) => Record<string, unknown>

/** migrations[n] upgrades a version-n document to version n+1. */
const migrations: Record<number, Migration> = {
  // v2 gave formations a hold time. Older routines never held, so they play back exactly as before.
  1: (doc) => ({
    ...doc,
    schemaVersion: 2,
    formations: Array.isArray(doc.formations)
      ? doc.formations.map((f: unknown) => (typeof f === 'object' && f !== null ? { holdMs: 0, ...f } : f))
      : doc.formations,
  }),
}

export function migrate(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  let doc = json as Record<string, unknown>
  let v = doc.schemaVersion
  if (typeof v !== 'number') return doc
  if (v > SCHEMA_VERSION) {
    throw new ProjectParseError(
      `This project was made with a newer version of the app (schema v${v}). Please update the app.`,
    )
  }
  while (typeof v === 'number' && v < SCHEMA_VERSION) {
    const step = migrations[v]
    if (!step) throw new ProjectParseError(`No migration available from schema v${v}.`)
    doc = step(doc)
    v = doc.schemaVersion
  }
  return doc
}

/** Parse + validate untrusted JSON text into a Project, with friendly errors. */
export function parseProject(text: string): Project {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new ProjectParseError('That file is not valid JSON, so it can’t be a project.')
  }
  if (typeof raw !== 'object' || raw === null || !('schemaVersion' in raw)) {
    throw new ProjectParseError('That file doesn’t look like a Formation Planner project.')
  }
  const migrated = migrate(raw)
  const result = projectSchema.safeParse(migrated)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue.path.join('.') || 'project'
    throw new ProjectParseError(`The project file is damaged (${where}: ${issue.message}).`)
  }
  const project = result.data as Project
  const ids = new Set(project.dancers.map((d) => d.id))
  for (const f of project.formations) {
    for (const id of Object.keys(f.positions)) {
      if (!ids.has(id)) delete f.positions[id]
    }
  }
  project.formations.sort((a, b) => a.timeMs - b.timeMs)
  return project
}
