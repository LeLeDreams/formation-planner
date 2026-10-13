/**
 * Core data model (schema v2). Everything here is plain, JSON-serializable data.
 * Time is always milliseconds on the media timeline. There is no tempo/count concept.
 *
 * Stage coordinates: origin at stage center, +x toward audience-right-hand side as seen
 * from the audience's perspective on screen, +y toward the audience (downstage).
 * Units are the stage's configured units (ft or m).
 */

export const SCHEMA_VERSION = 2 as const

export type Ms = number
export type DancerId = string
export type FormationId = string

export type EasingName = 'linear' | 'easeInOut' | 'easeIn' | 'easeOut' | 'hold'
export type PathKind = 'straight' | 'curved'
export type Level = 'low' | 'mid' | 'high'
export type AudienceSide = 'bottom' | 'top' | 'left' | 'right'
export type Units = 'ft' | 'm'
export type SectionType = 'intro' | 'verse' | 'chorus' | 'bridge' | 'outro' | 'custom'

export interface Vec2 {
  x: number
  y: number
}

export interface MediaRef {
  /** Content hash used as the key for the blob stored in IndexedDB. */
  hash: string
  name: string
  size: number
  mimeType: string
  durationMs?: Ms
}

export interface StageConfig {
  width: number
  depth: number
  units: Units
  audienceSide: AudienceSide
  wingDepth: number
  backdropImage?: MediaRef
}

export interface Dancer {
  id: DancerId
  name: string
  number: number
  color: string
}

export interface DancerState {
  x: number
  y: number
  /** Degrees. 0 = facing the audience, increasing clockwise as seen from above. */
  facing: number
  level?: Level
  /** false = offstage; x/y are then the offstage rest position. */
  present: boolean
}

export interface Formation {
  id: FormationId
  /** When the dancers are in place. */
  timeMs: Ms
  /**
   * How long the formation is held before the dancers set off for the next one. The move then
   * takes whatever time is left until the next formation's `timeMs`. Read it with `effectiveHold`:
   * a hold is cut short if the next formation starts sooner.
   */
  holdMs: Ms
  label: string
  notes: string
  positions: Record<DancerId, DancerState>
}

export interface DancerTransition {
  path: PathKind
  /** Bezier control point in stage units (used when path === 'curved'). */
  control?: Vec2
  /** Fraction (0..0.9) of the transition to wait before this dancer starts moving. */
  delayFrac?: number
}

export interface Transition {
  fromFormationId: FormationId
  easing: EasingName
  perDancer: Record<DancerId, DancerTransition>
}

export interface Section {
  id: string
  type: SectionType
  label: string
  startMs: Ms
  endMs: Ms
  color: string
}

export interface ProjectSettings {
  minDistance: number
  snapToGrid: boolean
  gridSize: number
}

export interface Project {
  schemaVersion: typeof SCHEMA_VERSION
  id: string
  name: string
  createdAt: string
  updatedAt: string
  stage: StageConfig
  media: {
    video?: MediaRef
    youtubeUrl?: string
  }
  dancers: Dancer[]
  /** Always kept sorted ascending by timeMs. */
  formations: Formation[]
  transitions: Transition[]
  sections: Section[]
  settings: ProjectSettings
}

export const DEFAULT_STAGE: StageConfig = {
  width: 40,
  depth: 30,
  units: 'ft',
  audienceSide: 'bottom',
  wingDepth: 6,
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  minDistance: 2.5,
  snapToGrid: true,
  gridSize: 1,
}

/** The most dancers a project is built (and tested) to handle comfortably. */
export const MAX_DANCERS = 40

/**
 * Soft pastel fills: 30 of them, so a large team gets a different color each (a deeper and a
 * paler set follow the first twelve). Dancers always show a number too, so color is never the only cue.
 */
export const DANCER_COLORS = [
  '#f7a8c4', '#a8d8f0', '#b5e5c8', '#fcd3a5', '#cbb8f5', '#f6ea9a',
  '#9fe0d6', '#f4b3a8', '#b3c3f7', '#d4e8a0', '#f3b8e6', '#c9d6e3',
  '#e88fa0', '#7fc4e8', '#8fd3a4', '#f2b47a', '#a995e8', '#e6d36a',
  '#6fcfc2', '#ea9486', '#8fa6ee', '#b9d977', '#e59ad6', '#a9bccf',
  '#fbd5e2', '#cfeaf8', '#d9f2e2', '#fde6c8', '#e3dafb', '#faf3c4',
]

export function newId(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${rand}`
}

export function createProject(name = 'Untitled routine'): Project {
  const now = new Date().toISOString()
  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId('proj'),
    name,
    createdAt: now,
    updatedAt: now,
    stage: { ...DEFAULT_STAGE },
    media: {},
    dancers: [],
    formations: [],
    transitions: [],
    sections: [],
    settings: { ...DEFAULT_SETTINGS },
  }
}

/** Insert keeping formations sorted by time. */
export function sortFormations(formations: Formation[]): void {
  formations.sort((a, b) => a.timeMs - b.timeMs)
}
