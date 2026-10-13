import type Konva from 'konva'
import { memo } from 'react'
import { Group, Line, Rect, Shape, Text } from 'react-konva'
import type { StageConfig } from '@/core/model'
import { VIEW_ROT, toView } from '@/core/stage'
import type { StageColors } from './colors'

interface Props {
  stage: StageConfig
  gridSize: number
  ppu: number
  colors: StageColors
  overlay: boolean
}

/** Draw straight segments in a single Konva path. */
function segments(lines: number[][]) {
  return (ctx: Konva.Context, shape: Konva.Shape) => {
    ctx.beginPath()
    for (const l of lines) {
      ctx.moveTo(l[0], l[1])
      ctx.lineTo(l[2], l[3])
    }
    ctx.strokeShape(shape)
  }
}

/** The static floor: wings, grid, center line, quarter marks and the audience edge. */
export const Floor = memo(function Floor({ stage, gridSize, ppu, colors, overlay }: Props) {
  const { width: W, depth: D, wingDepth: wing, audienceSide } = stage
  const hx = W / 2
  const hy = D / 2

  // Grid: faint lines every `gridSize` once there is room, stronger lines every 5 units.
  const minor: number[][] = []
  const major: number[][] = []
  const showMinor = gridSize * ppu >= 9
  const g = Math.max(0.25, gridSize)
  for (let x = 0; x <= hx + 1e-6; x += g) {
    const isMajor = Math.abs(x / 5 - Math.round(x / 5)) < 1e-6
    for (const sx of x === 0 ? [1] : [1, -1]) {
      const l = [x * sx, -hy, x * sx, hy]
      if (isMajor) major.push(l)
      else if (showMinor) minor.push(l)
    }
  }
  for (let y = 0; y <= hy + 1e-6; y += g) {
    const isMajor = Math.abs(y / 5 - Math.round(y / 5)) < 1e-6
    for (const sy of y === 0 ? [1] : [1, -1]) {
      const l = [-hx, y * sy, hx, y * sy]
      if (isMajor) major.push(l)
      else if (showMinor) minor.push(l)
    }
  }

  const label = toView({ x: 0, y: hy + 2.4 }, audienceSide)
  const fs = 1.5

  return (
    <>
      {/* Drawn in stage coordinates, then rotated so the audience is on the chosen side. */}
      <Group rotation={VIEW_ROT[audienceSide]} listening={false}>
        {wing > 0 && (
          <>
            <Rect
              x={-hx - wing}
              y={-hy}
              width={wing}
              height={D}
              fill={colors.wing}
              opacity={overlay ? 0.35 : 0.8}
              stroke={colors.border}
              strokeWidth={1}
              strokeScaleEnabled={false}
              dash={[4, 4]}
            />
            <Rect
              x={hx}
              y={-hy}
              width={wing}
              height={D}
              fill={colors.wing}
              opacity={overlay ? 0.35 : 0.8}
              stroke={colors.border}
              strokeWidth={1}
              strokeScaleEnabled={false}
              dash={[4, 4]}
            />
          </>
        )}
        <Rect
          x={-hx}
          y={-hy}
          width={W}
          height={D}
          fill={colors.floor}
          opacity={overlay ? 0.4 : 1}
          stroke={colors.border}
          strokeWidth={1.5}
          strokeScaleEnabled={false}
        />
        <Shape sceneFunc={segments(minor)} stroke={colors.grid} strokeWidth={1} strokeScaleEnabled={false} opacity={0.5} />
        <Shape sceneFunc={segments(major)} stroke={colors.gridMajor} strokeWidth={1} strokeScaleEnabled={false} opacity={0.28} />
        {/* Quarter marks */}
        <Shape
          sceneFunc={segments([
            [-hx / 2, -hy, -hx / 2, hy],
            [hx / 2, -hy, hx / 2, hy],
            [-hx, -hy / 2, hx, -hy / 2],
            [-hx, hy / 2, hx, hy / 2],
          ])}
          stroke={colors.gridMajor}
          strokeWidth={1}
          strokeScaleEnabled={false}
          dash={[5, 5]}
          opacity={0.55}
        />
        {/* Center line */}
        <Line points={[0, -hy, 0, hy]} stroke={colors.center} strokeWidth={1.5} strokeScaleEnabled={false} opacity={0.7} />
        <Line points={[-hx, 0, hx, 0]} stroke={colors.center} strokeWidth={1} strokeScaleEnabled={false} opacity={0.3} dash={[2, 4]} />
        {/* The audience edge */}
        <Line points={[-hx, hy, hx, hy]} stroke={colors.front} strokeWidth={4} strokeScaleEnabled={false} lineCap="round" />
      </Group>
      <Text
        text="▼  AUDIENCE  ▼"
        x={label.x - 12}
        y={label.y - fs / 2}
        width={24}
        align="center"
        fontSize={fs}
        fontStyle="bold"
        fill={colors.accent}
        listening={false}
        rotation={0}
      />
    </>
  )
})
