/** Pick a readable text color (dark ink or white) for a given background hex color. */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return 0
  const n = parseInt(m[1], 16)
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const r = lin((n >> 16) & 255)
  const g = lin((n >> 8) & 255)
  const b = lin(n & 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const DARK_INK = '#2b2347'

export function readableInk(bgHex: string): string {
  // Pastels are light, so dark ink wins for most; switch to white only on genuinely dark fills.
  return relativeLuminance(bgHex) > 0.3 ? DARK_INK : '#ffffff'
}
