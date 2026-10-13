import clsx from 'clsx'
import { StagePanel } from '@/features/stage/StagePanel'
import { VideoPlayer } from '@/features/video/VideoPlayer'
import { useUiStore } from '@/store/uiStore'

export function Workspace() {
  const layout = useUiStore((s) => s.stageLayout)
  const overlay = layout === 'overlay'

  return (
    <main className="relative min-h-0 min-w-0 flex-1 bg-bg p-3">
      <div className={clsx('grid h-full gap-3', overlay ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]')}>
        <section
          aria-label="Reference video"
          className="min-h-0 overflow-hidden rounded-2xl border border-line bg-panel shadow-sm"
        >
          <VideoPlayer>{overlay && <StagePanel overlay />}</VideoPlayer>
        </section>
        {!overlay && (
          <section
            aria-label="Stage"
            className="min-h-0 overflow-hidden rounded-2xl border border-line bg-panel shadow-sm"
          >
            <StagePanel />
          </section>
        )}
      </div>
    </main>
  )
}
