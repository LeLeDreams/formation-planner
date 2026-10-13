import clsx from 'clsx'
import { AlertCircle, FlipHorizontal2, FolderOpen, Film, Loader2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { describeMediaError, loadVideoFile, removeVideo } from '@/media/mediaSync'
import * as transport from '@/media/transport'
import { setPlayback, usePlaybackStore } from '@/store/playbackStore'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/ui/primitives'
import { Transport } from './Transport'

function pickFile(input: HTMLInputElement | null, files: FileList | null | undefined) {
  const file = files?.[0]
  if (file) void loadVideoFile(file)
  if (input) input.value = ''
}

export function VideoPlayer({ children }: { children?: ReactNode }) {
  const video = usePlaybackStore((s) => s.video)
  const status = usePlaybackStore((s) => s.mediaStatus)
  const message = usePlaybackStore((s) => s.mediaMessage)
  const missingRef = usePlaybackStore((s) => s.missingRef)
  const mirrored = useUiStore((s) => s.mirrorVideo)
  const toggleMirror = useUiStore((s) => s.toggleMirrorVideo)

  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [playError, setPlayError] = useState<string | null>(null)

  // A new video starts with a clean error slate.
  useEffect(() => setPlayError(null), [video?.hash])

  const choose = () => inputRef.current?.click()
  // Stable ref callback so the transport isn't detached/re-attached on every render.
  const attachVideo = useCallback((node: HTMLVideoElement | null) => {
    transport.attach(node)
    return () => transport.attach(null)
  }, [])
  const error = playError ?? message

  return (
    <div
      className={clsx('flex h-full flex-col', dragOver && 'ring-2 ring-inset ring-accent-strong')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        pickFile(null, e.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*,audio/*,.mkv,.mov,.m4v"
        className="hidden"
        aria-label="Choose a video file"
        onChange={(e) => pickFile(e.currentTarget, e.currentTarget.files)}
      />

      <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-line px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">Reference video</h2>
        {video && (
          <div className="flex min-w-0 items-center gap-1">
            <span className="truncate text-[12px] text-muted" title={video.name}>
              {video.name}
            </span>
            <Button
              label={mirrored ? 'Video is mirrored: show it the normal way round' : 'Mirror the video (flip left and right)'}
              active={mirrored}
              className="h-7 px-2"
              onClick={toggleMirror}
            >
              <FlipHorizontal2 size={14} />
              <span className="hidden sm:inline">{mirrored ? 'Mirrored' : 'Mirror'}</span>
            </Button>
            <Button label="Replace video" className="h-7 px-2" onClick={choose}>
              <FolderOpen size={14} />
              <span className="hidden sm:inline">Replace</span>
            </Button>
            <Button label="Remove video" className="h-7 w-7 px-0" onClick={removeVideo}>
              <X size={14} />
            </Button>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1 bg-videobg">
        {video ? (
          <video
            key={video.hash}
            ref={attachVideo}
            src={video.url}
            playsInline
            preload="auto"
            aria-label="Reference video"
            className={clsx('size-full cursor-pointer object-contain', mirrored && '-scale-x-100')}
            onClick={transport.toggle}
            onError={(e) => {
              setPlayError(describeMediaError(e.currentTarget.error))
              setPlayback({ playing: false })
            }}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-3 px-6 text-center">
            {status === 'loading' ? (
              <>
                <Loader2 size={28} className="animate-spin text-muted" />
                <p className="text-muted">Reading video…</p>
              </>
            ) : (
              <>
                <div className="grid size-14 place-items-center rounded-2xl bg-accent text-accent-fg">
                  <Film size={26} />
                </div>
                <div className="space-y-1">
                  <p className="text-[15px] font-semibold">
                    {status === 'missing' ? 'Reconnect your video' : 'Add your reference video'}
                  </p>
                  <p className="mx-auto max-w-sm text-[12px] leading-relaxed text-muted">
                    {status === 'missing' && missingRef
                      ? `“${missingRef.name}” isn’t stored on this device. Choose that file again to reconnect it.`
                      : 'Choose the song or choreography video to plan against. Its audio plays in sync with the stage. Drag and drop works too.'}
                  </p>
                </div>
                <Button variant="solid" onClick={choose}>
                  <FolderOpen size={16} /> Choose video
                </Button>
                <p className="text-[11px] text-muted">MP4 (H.264) and WebM work everywhere</p>
              </>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="absolute inset-x-3 top-3 flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[12px] shadow-lg"
          >
            <AlertCircle size={16} className="mt-px shrink-0 text-danger" />
            <p className="flex-1">{error}</p>
            <button
              type="button"
              aria-label="Dismiss message"
              className="text-muted hover:text-ink"
              onClick={() => {
                setPlayError(null)
                setPlayback({ mediaMessage: null })
              }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {children}
      </div>

      <Transport />
    </div>
  )
}
