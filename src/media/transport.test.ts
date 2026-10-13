// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPlayback, usePlaybackStore } from '@/store/playbackStore'
import { playhead } from '@/store/playheadStore'
import * as transport from './transport'
import { looksLikeMedia } from './mediaSync'

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
  transport.attach(null)
  setPlayback({
    playing: false, rate: 1, durationMs: 5000, loop: null, loopEnabled: false,
    video: null, fps: 30, muted: false, volume: 1,
  })
  playhead.set(0)
})

afterEach(() => {
  transport.pause()
  vi.useRealTimers()
})

describe('transport without a video (animation-frame clock)', () => {
  it('advances the playhead in real time while playing', () => {
    transport.play()
    expect(usePlaybackStore.getState().playing).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(playhead.get()).toBeGreaterThan(900)
    expect(playhead.get()).toBeLessThan(1100)
  })

  it('respects playback speed', () => {
    transport.setRate(2)
    transport.play()
    vi.advanceTimersByTime(1000)
    expect(playhead.get()).toBeGreaterThan(1800)
    expect(playhead.get()).toBeLessThan(2200)
  })

  it('stops at the end of the timeline', () => {
    playhead.set(4900)
    transport.play()
    vi.advanceTimersByTime(500)
    expect(usePlaybackStore.getState().playing).toBe(false)
    expect(playhead.get()).toBe(5000)
  })

  it('restarts from the beginning when played from the very end', () => {
    playhead.set(5000)
    transport.play()
    vi.advanceTimersByTime(100)
    expect(playhead.get()).toBeLessThan(500)
  })

  it('jumps back to the loop start when it reaches the loop end', () => {
    transport.setLoop({ startMs: 1000, endMs: 2000 })
    playhead.set(1900)
    transport.play()
    vi.advanceTimersByTime(300)
    expect(playhead.get()).toBeGreaterThanOrEqual(1000)
    expect(playhead.get()).toBeLessThan(1500)
    expect(usePlaybackStore.getState().playing).toBe(true)
  })

  it('does not loop when looping is switched off', () => {
    transport.setLoop({ startMs: 1000, endMs: 2000 })
    transport.toggleLoop()
    playhead.set(1900)
    transport.play()
    vi.advanceTimersByTime(300)
    expect(playhead.get()).toBeGreaterThan(2000)
  })

  it('toggle pauses and resumes', () => {
    transport.toggle()
    expect(usePlaybackStore.getState().playing).toBe(true)
    transport.toggle()
    expect(usePlaybackStore.getState().playing).toBe(false)
  })
})

describe('seek and step', () => {
  it('clamps seeks to the timeline', () => {
    transport.seek(-50)
    expect(playhead.get()).toBe(0)
    transport.seek(99_999)
    expect(playhead.get()).toBe(5000)
  })

  it('steps one frame at a time without skipping or repeating', () => {
    setPlayback({ fps: 30 })
    transport.seek(1000)
    const seen: number[] = []
    for (let i = 0; i < 4; i++) {
      transport.step(1)
      seen.push(Math.floor((playhead.get() / 1000) * 30))
    }
    expect(seen).toEqual([31, 32, 33, 34])
    transport.step(-1)
    expect(Math.floor((playhead.get() / 1000) * 30)).toBe(33)
  })

  it('never steps before time zero', () => {
    transport.seek(0)
    transport.step(-5)
    expect(playhead.get()).toBeGreaterThanOrEqual(0)
  })

  it('nudges by seconds', () => {
    transport.seek(2000)
    transport.nudge(1)
    expect(playhead.get()).toBe(3000)
    transport.nudge(-10)
    expect(playhead.get()).toBe(0)
  })
})

describe('speed, volume and mute', () => {
  it('clamps speed to 0.25x - 2x', () => {
    transport.setRate(10)
    expect(usePlaybackStore.getState().rate).toBe(2)
    transport.setRate(0.01)
    expect(usePlaybackStore.getState().rate).toBe(0.25)
  })

  it('unmuting from zero volume restores an audible level', () => {
    transport.setVolume(0)
    expect(usePlaybackStore.getState().muted).toBe(true)
    transport.setMuted(false)
    expect(usePlaybackStore.getState().muted).toBe(false)
    expect(usePlaybackStore.getState().volume).toBeGreaterThan(0)
  })

  it('toggles mute', () => {
    transport.toggleMute()
    expect(usePlaybackStore.getState().muted).toBe(true)
    transport.toggleMute()
    expect(usePlaybackStore.getState().muted).toBe(false)
  })
})

describe('loop region', () => {
  it('sets in and out points and enables looping', () => {
    playhead.set(1000)
    transport.setLoopStart()
    playhead.set(3000)
    transport.setLoopEnd()
    const s = usePlaybackStore.getState()
    expect(s.loop).toEqual({ startMs: 1000, endMs: 3000 })
    expect(s.loopEnabled).toBe(true)
  })

  it('swaps reversed points and rejects tiny regions', () => {
    transport.setLoop({ startMs: 3000, endMs: 1000 })
    expect(usePlaybackStore.getState().loop).toEqual({ startMs: 1000, endMs: 3000 })
    transport.setLoop({ startMs: 1000, endMs: 1010 })
    expect(usePlaybackStore.getState().loop).toBeNull()
  })

  it('clears the loop', () => {
    transport.setLoop({ startMs: 0, endMs: 2000 })
    transport.setLoop(null)
    expect(usePlaybackStore.getState().loop).toBeNull()
    expect(usePlaybackStore.getState().loopEnabled).toBe(false)
  })
})

describe('looksLikeMedia', () => {
  it('accepts video/audio mime types and known extensions', () => {
    expect(looksLikeMedia(new File([], 'a.mp4', { type: 'video/mp4' }))).toBe(true)
    expect(looksLikeMedia(new File([], 'song.mp3', { type: '' }))).toBe(true)
    expect(looksLikeMedia(new File([], 'clip.MKV', { type: '' }))).toBe(true)
  })
  it('rejects other files', () => {
    expect(looksLikeMedia(new File([], 'notes.pdf', { type: 'application/pdf' }))).toBe(false)
  })
})
