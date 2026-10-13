import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Repeat,
  SkipBack,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { formatTime } from '@/core/time'
import * as transport from '@/media/transport'
import { RATES, usePlaybackStore } from '@/store/playbackStore'
import { playhead } from '@/store/playheadStore'
import { Button } from '@/ui/primitives'

/** Shows the playhead time without re-rendering React every frame. */
function TimeReadout() {
  const ref = useRef<HTMLSpanElement>(null)
  const durationMs = usePlaybackStore((s) => s.durationMs)

  useEffect(() => {
    let lastText = ''
    const update = (t: number) => {
      const text = formatTime(t)
      if (text !== lastText && ref.current) {
        ref.current.textContent = text
        lastText = text
      }
    }
    update(playhead.get())
    return playhead.subscribe(update)
  }, [])

  return (
    <div className="flex items-baseline gap-1 font-mono text-[13px] tabular-nums" aria-label="Playhead time">
      <span ref={ref} className="text-ink">
        0:00.0
      </span>
      <span className="text-muted">/ {formatTime(durationMs)}</span>
    </div>
  )
}

function SeekBar() {
  const ref = useRef<HTMLInputElement>(null)
  const dragging = useRef(false)
  const durationMs = usePlaybackStore((s) => s.durationMs)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let lastText = ''
    const update = (t: number) => {
      if (!dragging.current) el.value = String(t)
      const text = formatTime(t)
      if (text !== lastText) {
        el.setAttribute('aria-valuetext', text)
        lastText = text
      }
    }
    update(playhead.get())
    return playhead.subscribe(update)
  }, [durationMs])

  return (
    <input
      ref={ref}
      type="range"
      className="seek w-full"
      aria-label="Seek"
      min={0}
      max={Math.max(1, Math.round(durationMs))}
      step={1}
      defaultValue={Math.round(playhead.get())}
      onPointerDown={() => (dragging.current = true)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onBlur={() => (dragging.current = false)}
      onInput={(e) => transport.seek(Number(e.currentTarget.value))}
    />
  )
}

export function Transport() {
  const playing = usePlaybackStore((s) => s.playing)
  const rate = usePlaybackStore((s) => s.rate)
  const muted = usePlaybackStore((s) => s.muted)
  const volume = usePlaybackStore((s) => s.volume)
  const loop = usePlaybackStore((s) => s.loop)
  const loopEnabled = usePlaybackStore((s) => s.loopEnabled)

  return (
    <div className="shrink-0 space-y-1.5 border-t border-line bg-panel px-3 pb-2 pt-1.5">
      <SeekBar />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-0.5">
          <Button label="Back to start (Home)" onClick={() => transport.seek(0)}>
            <SkipBack size={16} />
          </Button>
          <Button label="Previous frame (←)" onClick={() => transport.step(-1)}>
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="solid"
            label={playing ? 'Pause (Space)' : 'Play (Space)'}
            className="size-9 rounded-full px-0"
            onClick={transport.toggle}
          >
            {playing ? <Pause size={16} /> : <Play size={16} className="translate-x-px" />}
          </Button>
          <Button label="Next frame (→)" onClick={() => transport.step(1)}>
            <ChevronRight size={16} />
          </Button>
        </div>

        <TimeReadout />

        <div className="flex-1" />

        <select
          aria-label="Playback speed"
          value={rate}
          onChange={(e) => transport.setRate(Number(e.target.value))}
          className="h-8 rounded-md border border-line bg-panel2 px-1.5 text-[13px] text-ink"
        >
          {RATES.map((r) => (
            <option key={r} value={r}>
              {r}×
            </option>
          ))}
        </select>

        <div className="flex items-center gap-0.5 rounded-lg bg-panel2 p-0.5" role="group" aria-label="Loop section">
          <Button label="Set loop start at playhead ([)" className="h-7 px-2" onClick={() => transport.setLoopStart()}>
            In
          </Button>
          <Button label="Set loop end at playhead (])" className="h-7 px-2" onClick={() => transport.setLoopEnd()}>
            Out
          </Button>
          <Button
            label={loopEnabled ? 'Loop on (L)' : 'Loop off (L)'}
            active={loopEnabled}
            disabled={!loop}
            className="h-7 px-2"
            onClick={transport.toggleLoop}
          >
            <Repeat size={14} />
          </Button>
          <Button label="Clear loop" disabled={!loop} className="h-7 w-7 px-0" onClick={() => transport.setLoop(null)}>
            <X size={14} />
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button label={muted ? 'Unmute (M)' : 'Mute (M)'} onClick={transport.toggleMute}>
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </Button>
          <input
            type="range"
            className="seek w-20"
            aria-label="Volume"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v > 0 && muted) transport.setMuted(false)
              transport.setVolume(v)
            }}
          />
        </div>
      </div>
    </div>
  )
}
