import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import { memo, useLayoutEffect, useRef } from 'react'
import { Circle, Group, RegularPolygon, Text } from 'react-konva'
import { readableInk } from '@/core/color'
import type { Dancer, DancerId } from '@/core/model'
import type { StageColors } from './colors'

/** Marker radius in stage units (feet or meters). */
export const MARKER_R = 1.3

export interface MarkerNodes {
  group: Konva.Group
  facing: Konva.Group
  warn: Konva.Circle
}

export interface MarkerHandlers {
  register: (id: DancerId, nodes: MarkerNodes | null) => void
  press: (id: DancerId, e: KonvaEventObject<MouseEvent | TouchEvent>) => void
  click: (id: DancerId, e: KonvaEventObject<MouseEvent | TouchEvent>) => void
  dragStart: (id: DancerId, e: KonvaEventObject<DragEvent>) => void
  dragMove: (id: DancerId, e: KonvaEventObject<DragEvent>) => void
  dragEnd: (id: DancerId, e: KonvaEventObject<DragEvent>) => void
}

interface Props {
  dancer: Dancer
  selected: boolean
  colors: StageColors
  overlay: boolean
  handlers: MarkerHandlers
}

/**
 * One dancer. Position, facing, opacity and the crowding ring are set imperatively by the
 * stage (so playback never goes through React), which is why none of them are props here.
 */
export const DancerMarker = memo(function DancerMarker({ dancer, selected, colors, overlay, handlers }: Props) {
  const groupRef = useRef<Konva.Group>(null)
  const facingRef = useRef<Konva.Group>(null)
  const warnRef = useRef<Konva.Circle>(null)
  const id = dancer.id

  useLayoutEffect(() => {
    if (groupRef.current && facingRef.current && warnRef.current) {
      handlers.register(id, { group: groupRef.current, facing: facingRef.current, warn: warnRef.current })
    }
    return () => handlers.register(id, null)
  }, [id, handlers])

  const ink = readableInk(dancer.color)
  const fontSize = MARKER_R * (String(dancer.number).length > 2 ? 0.8 : 1.05)

  return (
    <Group
      ref={groupRef}
      name="dancer"
      draggable
      onMouseDown={(e) => handlers.press(id, e)}
      onTouchStart={(e) => handlers.press(id, e)}
      onClick={(e) => handlers.click(id, e)}
      onTap={(e) => handlers.click(id, e)}
      onDragStart={(e) => handlers.dragStart(id, e)}
      onDragMove={(e) => handlers.dragMove(id, e)}
      onDragEnd={(e) => handlers.dragEnd(id, e)}
    >
      {/* Generous invisible hit area for fingers. */}
      <Circle radius={MARKER_R + 0.6} fill="rgba(0,0,0,0.01)" />
      <Circle
        ref={warnRef}
        radius={MARKER_R + 0.55}
        stroke={colors.danger}
        strokeWidth={2}
        strokeScaleEnabled={false}
        dash={[4, 3]}
        visible={false}
        listening={false}
      />
      {selected && (
        <Circle
          radius={MARKER_R + 0.3}
          stroke={colors.accent}
          strokeWidth={3}
          strokeScaleEnabled={false}
          listening={false}
        />
      )}
      <Group ref={facingRef} listening={false}>
        {/* Points toward +y in its own frame; the stage rotates it to the dancer's facing. */}
        <RegularPolygon sides={3} radius={0.62} y={MARKER_R + 0.5} rotation={180} fill={colors.ink} opacity={0.85} />
      </Group>
      <Circle
        radius={MARKER_R}
        fill={dancer.color}
        stroke={overlay ? '#ffffff' : colors.ink}
        strokeWidth={1.5}
        strokeScaleEnabled={false}
        perfectDrawEnabled={false}
        listening={false}
      />
      <Text
        text={String(dancer.number)}
        x={-MARKER_R}
        y={-MARKER_R}
        width={MARKER_R * 2}
        height={MARKER_R * 2}
        align="center"
        verticalAlign="middle"
        fontSize={fontSize}
        fontStyle="bold"
        fill={ink}
        listening={false}
      />
    </Group>
  )
})
