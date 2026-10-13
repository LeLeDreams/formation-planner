import { arrange, defaultSpacing, type ArrangeKind } from './arrange'
import {
  DANCER_COLORS,
  createProject,
  type Dancer,
  type DancerState,
  type Formation,
  type Project,
  type Transition,
  type Vec2,
} from './model'
import { facingToward, floorBounds, round2 } from './stage'

const NAMES = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana']

interface Step {
  timeMs: number
  label: string
  notes: string
  kind: ArrangeKind
  center: Vec2
  /** Face the center of the shape instead of the audience. */
  inward?: boolean
}

const STEPS: Step[] = [
  { timeMs: 0, label: 'Opening line', notes: 'Hit the pose and hold.', kind: 'line', center: { x: 0, y: 6 } },
  { timeMs: 4000, label: 'Circle', notes: 'Everyone faces the center.', kind: 'circle', center: { x: 0, y: 0 }, inward: true },
  { timeMs: 8000, label: 'V (chorus)', notes: 'Point toward the audience.', kind: 'v', center: { x: 0, y: -1 } },
  { timeMs: 12000, label: 'Two rows', notes: 'Back row steps up between the front row.', kind: 'block', center: { x: 0, y: 0 } },
  { timeMs: 16000, label: 'Diagonal', notes: 'Cross from upstage left.', kind: 'diagonal', center: { x: 0, y: 0 } },
  { timeMs: 20000, label: 'Final arc', notes: 'Hold for the last beat.', kind: 'arc', center: { x: 0, y: 2 } },
]

/** A small demo routine: 8 dancers moving through six formations. */
export function createSampleProject(): Project {
  const p = createProject('Sample routine')
  p.dancers = NAMES.map<Dancer>((name, i) => ({
    id: `d${i + 1}`,
    name,
    number: i + 1,
    color: DANCER_COLORS[i % DANCER_COLORS.length],
  }))

  const spacing = defaultSpacing(p.settings.minDistance) + 1
  let prev: Vec2[] = p.dancers.map((_, i) => ({ x: (i - 3.5) * spacing, y: 6 }))
  const formations: Formation[] = []
  const transitions: Transition[] = []

  STEPS.forEach((step, si) => {
    const items = p.dancers.map((d, i) => ({ id: d.id, x: prev[i].x, y: prev[i].y }))
    const placed = arrange(step.kind, items, {
      spacing,
      center: step.center,
      bounds: floorBounds(p.stage),
    })
    const positions: Record<string, DancerState> = {}
    for (const d of p.dancers) {
      const pos = placed[d.id]
      positions[d.id] = {
        x: round2(pos.x),
        y: round2(pos.y),
        facing: step.inward ? round2(facingToward(pos, step.center)) : 0,
        present: true,
      }
    }
    const id = `f${si + 1}`
    formations.push({ id, timeMs: step.timeMs, holdMs: 1500, label: step.label, notes: step.notes, positions })
    prev = p.dancers.map((d) => positions[d.id])

    const tr: Transition = { fromFormationId: id, easing: 'easeInOut', perDancer: {} }
    // Show off staggered starts and curved paths between a couple of the formations.
    if (si === 0) p.dancers.forEach((d, i) => (tr.perDancer[d.id] = { path: 'straight', delayFrac: (i % 4) * 0.08 }))
    if (si === 1) p.dancers.forEach((d) => (tr.perDancer[d.id] = { path: 'curved' }))
    transitions.push(tr)
  })

  p.formations = formations
  p.transitions = transitions
  return p
}
