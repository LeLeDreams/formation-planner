import { readableInk } from '@/core/color'
import { formationIndexAt, formationName } from '@/core/formations'
import { findFormationIndex, getFrameAt } from '@/core/interpolate'
import type { Ms, Project } from '@/core/model'
import { VIEW_ROT, toView, viewExtent } from '@/core/stage'
import { formatTime } from '@/core/time'

/** Same marker size as on the stage, in stage units. */
const MARKER_R = 1.3

export interface FrameColors {
  background: string
  floor: string
  wing: string
  border: string
  grid: string
  center: string
  front: string
  ink: string
  muted: string
}

export type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Height of the title strip, as a fraction of the frame height. */
const HEADER_FRAC = 0.085

/** Where the stage goes: the whole frame under the title strip, with a margin. */
export function stageArea(W: number, H: number): Rect {
  const header = Math.round(H * HEADER_FRAC)
  const pad = Math.round(H * 0.03)
  return { x: pad, y: header, w: W - pad * 2, h: H - header - pad }
}

/**
 * Where the reference video goes: a picture-in-picture box in one corner, `frac` of the frame
 * wide, keeping the video's own shape (and never taller than 45% of the frame).
 */
export function pipRect(W: number, H: number, corner: Corner, aspect: number, frac: number): Rect {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9
  let w = W * frac
  let h = w / safe
  const maxH = H * 0.45
  if (h > maxH) {
    h = maxH
    w = h * safe
  }
  const m = Math.round(H * 0.025)
  const header = Math.round(H * HEADER_FRAC)
  return {
    x: corner.endsWith('left') ? m : W - m - w,
    y: corner.startsWith('top') ? header + m : H - m - h,
    w,
    h,
  }
}

const deg = (d: number): number => (d * Math.PI) / 180

function line(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
}

/** Draw the floor and every dancer at time t, fitted inside `area`. */
export function drawStage(ctx: CanvasRenderingContext2D, project: Project, t: Ms, area: Rect, colors: FrameColors): void {
  const { stage, dancers } = project
  const side = stage.audienceSide
  const rot = VIEW_ROT[side]
  const ext = viewExtent(stage)
  // Leave room around the floor for the audience label and for markers standing on the edge.
  const ppu = Math.min(area.w / (ext.w + 4), area.h / (ext.h + 8))
  const px = 1 / ppu
  const hx = stage.width / 2
  const hy = stage.depth / 2

  ctx.save()
  ctx.translate(area.x + area.w / 2, area.y + area.h / 2)
  ctx.scale(ppu, ppu)

  ctx.save()
  ctx.rotate(deg(rot))
  if (stage.wingDepth > 0) {
    ctx.fillStyle = colors.wing
    ctx.globalAlpha = 0.8
    ctx.fillRect(-hx - stage.wingDepth, -hy, stage.wingDepth, stage.depth)
    ctx.fillRect(hx, -hy, stage.wingDepth, stage.depth)
    ctx.globalAlpha = 1
  }
  ctx.fillStyle = colors.floor
  ctx.fillRect(-hx, -hy, stage.width, stage.depth)
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = px
  ctx.globalAlpha = 0.6
  for (let x = 5; x < hx; x += 5) {
    line(ctx, x, -hy, x, hy)
    line(ctx, -x, -hy, -x, hy)
  }
  for (let y = 0; y < hy; y += 5) {
    line(ctx, -hx, y, hx, y)
    if (y > 0) line(ctx, -hx, -y, hx, -y)
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 1.5 * px
  ctx.strokeRect(-hx, -hy, stage.width, stage.depth)
  ctx.strokeStyle = colors.center
  ctx.globalAlpha = 0.7
  line(ctx, 0, -hy, 0, hy)
  ctx.globalAlpha = 1
  ctx.strokeStyle = colors.front
  ctx.lineWidth = 4 * px
  ctx.lineCap = 'round'
  line(ctx, -hx, hy, hx, hy)
  ctx.restore()

  const label = toView({ x: 0, y: hy + 2.2 }, side)
  ctx.fillStyle = colors.center
  ctx.font = `bold 1.4px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('▼  AUDIENCE  ▼', label.x, label.y)

  const frame = getFrameAt(project, t)
  for (const d of dancers) {
    const s = frame[d.id]
    if (!s || s.opacity <= 0.02) continue
    const v = toView(s, side)
    ctx.save()
    ctx.globalAlpha = s.opacity
    ctx.translate(v.x, v.y)

    // Facing pointer: points at the audience when facing is 0.
    ctx.save()
    ctx.rotate(deg(s.facing + rot))
    ctx.fillStyle = colors.ink
    ctx.beginPath()
    ctx.moveTo(0, MARKER_R + 1.1)
    ctx.lineTo(-0.54, MARKER_R + 0.2)
    ctx.lineTo(0.54, MARKER_R + 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.restore()

    ctx.beginPath()
    ctx.arc(0, 0, MARKER_R, 0, Math.PI * 2)
    ctx.fillStyle = d.color
    ctx.fill()
    ctx.strokeStyle = colors.ink
    ctx.lineWidth = 1.5 * px
    ctx.stroke()

    const text = String(d.number)
    ctx.fillStyle = readableInk(d.color)
    ctx.font = `bold ${MARKER_R * (text.length > 2 ? 0.8 : 1.05)}px system-ui, sans-serif`
    ctx.fillText(text, 0, 0.05)
    ctx.restore()
  }
  ctx.restore()
}

/** The strip along the top: routine name, the formation on stage right now, and the time. */
export function drawHeader(ctx: CanvasRenderingContext2D, project: Project, t: Ms, W: number, H: number, colors: FrameColors): void {
  const h = Math.round(H * HEADER_FRAC)
  const pad = Math.round(H * 0.03)
  const f = project.formations
  const at = formationIndexAt(f, t)
  const before = findFormationIndex(f, t)
  let status = ''
  if (at >= 0) status = formationName(f[at], at)
  else if (before >= 0 && f[before + 1]) status = `Moving to ${formationName(f[before + 1], before + 1)}`
  else if (before >= 0) status = formationName(f[before], before)

  ctx.save()
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = colors.ink
  ctx.font = `600 ${Math.round(h * 0.4)}px system-ui, sans-serif`
  const name = project.name.trim() || 'Untitled routine'
  ctx.fillText(name, pad, h / 2, W * 0.4)
  const nameW = Math.min(ctx.measureText(name).width, W * 0.4)
  ctx.fillStyle = colors.muted
  ctx.font = `${Math.round(h * 0.36)}px system-ui, sans-serif`
  if (status) ctx.fillText(`·  ${status}`, pad + nameW + h * 0.3, h / 2, W * 0.4)
  ctx.textAlign = 'right'
  ctx.font = `${Math.round(h * 0.36)}px ui-monospace, monospace`
  ctx.fillText(formatTime(t), W - pad, h / 2)
  ctx.restore()
}

/** Draw the reference video into its corner box, with a border. `mirrored` flips it left-to-right. */
export function drawPip(ctx: CanvasRenderingContext2D, video: CanvasImageSource, r: Rect, mirrored: boolean, colors: FrameColors): void {
  ctx.save()
  ctx.fillStyle = '#000'
  ctx.fillRect(r.x, r.y, r.w, r.h)
  if (mirrored) {
    ctx.translate(r.x + r.w, r.y)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, r.w, r.h)
  } else {
    ctx.drawImage(video, r.x, r.y, r.w, r.h)
  }
  ctx.restore()
  ctx.save()
  ctx.strokeStyle = colors.border
  ctx.lineWidth = 2
  ctx.strokeRect(r.x, r.y, r.w, r.h)
  ctx.restore()
}
