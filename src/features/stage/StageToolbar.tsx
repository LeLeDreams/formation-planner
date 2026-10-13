import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  Expand,
  Grid3x3,
  Layers,
  Magnet,
  Maximize2,
  RotateCcw,
  RotateCw,
  Shapes,
  Shrink,
  Spline,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { ARRANGE_LABELS, type ArrangeKind } from '@/core/arrange'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/ui/primitives'
import { MenuItem, Popover } from '@/ui/Popover'
import { alignTarget, arrangeTarget, distributeTarget, rotateTarget, scaleTarget } from './actions'
import { stageControls } from './StageCanvas'

const Sep = () => <div className="mx-0.5 h-5 w-px shrink-0 bg-line" aria-hidden="true" />

export function StageToolbar({ floating = false }: { floating?: boolean }) {
  const snap = useProjectStore((s) => selectProject(s).settings.snapToGrid)
  const hasDancers = useProjectStore((s) => selectProject(s).dancers.length > 0)
  const guides = useUiStore((s) => s.guides)
  const onion = useUiStore((s) => s.onion)
  const paths = useUiStore((s) => s.paths)
  const toggle = useUiStore((s) => s.toggle)
  const selCount = useUiStore((s) => s.selectedDancerIds.length)
  const scope = selCount ? 'the selected dancers' : 'everyone on stage'

  return (
    <div
      role="toolbar"
      aria-label="Stage tools"
      className={
        floating
          ? 'absolute inset-x-2 top-2 z-10 flex flex-wrap items-center gap-0.5 rounded-xl border border-line bg-panel/95 p-1 shadow-lg backdrop-blur'
          : 'flex shrink-0 flex-wrap items-center gap-0.5 border-b border-line px-2 py-1'
      }
    >
      <Button
        label={snap ? 'Snap to grid: on' : 'Snap to grid: off'}
        active={snap}
        onClick={() => useProjectStore.getState().edit('Toggle snap', (d) => void (d.settings.snapToGrid = !d.settings.snapToGrid))}
      >
        <Grid3x3 size={16} />
      </Button>
      <Button label={guides ? 'Smart guides: on' : 'Smart guides: off'} active={guides} onClick={() => toggle('guides')}>
        <Magnet size={16} />
      </Button>
      <Button
        label={onion ? 'Next formation ghost: on (where everyone goes next)' : 'Next formation ghost: off'}
        active={onion}
        onClick={() => toggle('onion')}
      >
        <Layers size={16} />
      </Button>
      <Button label={paths ? 'Movement paths: on' : 'Movement paths: off'} active={paths} onClick={() => toggle('paths')}>
        <Spline size={16} />
      </Button>

      <Sep />

      <Popover label={`Arrange ${scope} in a shape`} icon={<Shapes size={16} />} text="Arrange">
        {(close) =>
          (Object.keys(ARRANGE_LABELS) as ArrangeKind[]).map((k) => (
            <MenuItem
              key={k}
              disabled={!hasDancers}
              onClick={() => {
                arrangeTarget(k)
                close()
              }}
            >
              {ARRANGE_LABELS[k]}
            </MenuItem>
          ))
        }
      </Popover>
      <Popover label={`Align ${scope}`} icon={<AlignStartVertical size={16} />} text="Align">
        {(close) => {
          const run = (fn: () => void) => () => {
            fn()
            close()
          }
          return (
            <>
              <MenuItem icon={<AlignStartVertical size={14} />} onClick={run(() => alignTarget('left'))}>Align left</MenuItem>
              <MenuItem icon={<AlignCenterVertical size={14} />} onClick={run(() => alignTarget('centerX'))}>Align center</MenuItem>
              <MenuItem icon={<AlignEndVertical size={14} />} onClick={run(() => alignTarget('right'))}>Align right</MenuItem>
              <MenuItem icon={<AlignStartHorizontal size={14} />} onClick={run(() => alignTarget('top'))}>Align top</MenuItem>
              <MenuItem icon={<AlignCenterHorizontal size={14} />} onClick={run(() => alignTarget('centerY'))}>Align middle</MenuItem>
              <MenuItem icon={<AlignEndHorizontal size={14} />} onClick={run(() => alignTarget('bottom'))}>Align bottom</MenuItem>
              <div className="my-1 h-px bg-line" />
              <MenuItem icon={<AlignHorizontalSpaceBetween size={14} />} onClick={run(() => distributeTarget('horizontal'))}>
                Distribute horizontally
              </MenuItem>
              <MenuItem icon={<AlignVerticalSpaceBetween size={14} />} onClick={run(() => distributeTarget('vertical'))}>
                Distribute vertically
              </MenuItem>
            </>
          )
        }}
      </Popover>

      <Button label={`Rotate ${scope} left 15°`} onClick={() => rotateTarget(-15)} disabled={!hasDancers}>
        <RotateCcw size={16} />
      </Button>
      <Button label={`Rotate ${scope} right 15°`} onClick={() => rotateTarget(15)} disabled={!hasDancers}>
        <RotateCw size={16} />
      </Button>
      <Button label={`Make ${scope} closer together`} onClick={() => scaleTarget(0.9)} disabled={!hasDancers}>
        <Shrink size={16} />
      </Button>
      <Button label={`Spread ${scope} further apart`} onClick={() => scaleTarget(1.1)} disabled={!hasDancers}>
        <Expand size={16} />
      </Button>

      <div className="flex-1" />

      <Button label="Zoom out stage (−)" onClick={() => stageControls.zoomBy(0.8)}>
        <ZoomOut size={16} />
      </Button>
      <Button label="Zoom in stage (+)" onClick={() => stageControls.zoomBy(1.25)}>
        <ZoomIn size={16} />
      </Button>
      <Button label="Fit stage to view (0)" onClick={() => stageControls.fit()}>
        <Maximize2 size={15} />
      </Button>
    </div>
  )
}
