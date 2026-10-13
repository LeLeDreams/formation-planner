/** Konva can't read CSS variables, so resolve the theme tokens to concrete colors. */
export interface StageColors {
  floor: string
  wing: string
  border: string
  grid: string
  gridMajor: string
  center: string
  front: string
  ink: string
  muted: string
  accent: string
  accentFill: string
  danger: string
}

const css = (name: string): string => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

export function readStageColors(): StageColors {
  return {
    floor: css('--panel-2'),
    wing: css('--raised'),
    border: css('--border'),
    grid: css('--border'),
    gridMajor: css('--muted'),
    center: css('--accent-strong'),
    front: css('--accent-strong'),
    ink: css('--text'),
    muted: css('--muted'),
    accent: css('--accent-strong'),
    accentFill: css('--accent'),
    danger: css('--danger'),
  }
}
