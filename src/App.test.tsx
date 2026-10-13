// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { createProject } from './core/model'
import { db } from './media/db'
import { loadVideoFile } from './media/mediaSync'
import * as transport from './media/transport'
import { setPlayback, usePlaybackStore } from './store/playbackStore'
import { playhead } from './store/playheadStore'
import { useProjectStore } from './store/projectStore'
import { useUiStore } from './store/uiStore'

// jsdom has no canvas, so the Konva stage is replaced by a stand-in (real behavior is checked in a browser).
vi.mock('react-konva', async () => {
  const React = await import('react')
  const Passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement('div', null, children)
  return { Stage: Passthrough, Layer: Passthrough, Group: Passthrough, Rect: Passthrough, Circle: Passthrough, Line: Passthrough, Arrow: Passthrough, Text: Passthrough, Ring: Passthrough, Wedge: Passthrough, Path: Passthrough, Ellipse: Passthrough, RegularPolygon: Passthrough }
})

// jsdom has no ResizeObserver or canvas; the real browser does. Minimal stand-ins for the shell test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
HTMLCanvasElement.prototype.getContext = (() => null) as never

// Tell React this environment supports act().
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

const byLabel = (label: string) =>
  container.querySelector<HTMLElement>(`[aria-label="${label}"]`)

beforeEach(async () => {
  localStorage.clear()
  await db.projects.clear()
  useProjectStore.getState().loadProject(createProject())
  useUiStore.setState({ selectedDancerIds: [], showShortcuts: false })
  useUiStore.getState().setTheme('light')
  setPlayback({ playing: false, mediaMessage: null, durationMs: 60_000, loop: null, loopEnabled: false })
  playhead.set(0)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<App />))
  // The app opens (or creates) a saved project asynchronously before showing the workspace.
  await vi.waitFor(() => expect(container.textContent).not.toContain('Opening your project'))
})

afterEach(() => {
  act(() => transport.pause())
  act(() => root.unmount())
  container.remove()
})

describe('layout shell', () => {
  it('renders the main regions', () => {
    for (const label of ['Dancer roster', 'Inspector', 'Timeline', 'Reference video', 'Stage']) {
      expect(byLabel(label), label).not.toBeNull()
    }
  })

  it('adds a dancer, then undo and redo work from the top bar', () => {
    act(() => byLabel('Add dancer')!.click())
    expect(useProjectStore.getState().history.present.dancers).toHaveLength(1)
    expect(byLabel('Name for dancer 1')).not.toBeNull()

    act(() => byLabel('Undo (Ctrl/⌘ Z)')!.click())
    expect(useProjectStore.getState().history.present.dancers).toHaveLength(0)
    expect(byLabel('Name for dancer 1')).toBeNull()

    act(() => byLabel('Redo (Ctrl/⌘ Shift Z)')!.click())
    expect(useProjectStore.getState().history.present.dancers).toHaveLength(1)
  })

  it('undoes with the keyboard shortcut', () => {
    act(() => useProjectStore.getState().addDancer())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    })
    expect(useProjectStore.getState().history.present.dancers).toHaveLength(0)
  })

  it('toggles the theme on the document element', () => {
    // Pastel light is the default.
    act(() => byLabel('Switch to dark theme')!.click())
    expect(document.documentElement.dataset.theme).toBe('dark')
    act(() => byLabel('Switch to light theme')!.click())
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('opens the shortcut cheat sheet with ? and closes it with Escape', () => {
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
    })
    expect(byLabel('Keyboard shortcuts')).not.toBeNull()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('removing a dancer clears it from the roster', () => {
    act(() => void useProjectStore.getState().addDancer())
    act(() => byLabel('Remove Dancer 1')!.click())
    expect(useProjectStore.getState().history.present.dancers).toHaveLength(0)
  })

  it('deleting formations (including the last one on the timeline) keeps the app on screen', () => {
    const store = useProjectStore.getState()
    act(() => void store.addDancer())
    act(() => store.setPoses(4000, { [useProjectStore.getState().history.present.dancers[0].id]: { x: 5 } }, 'Move dancer'))
    act(() => store.setPoses(8000, { [useProjectStore.getState().history.present.dancers[0].id]: { x: 9 } }, 'Move dancer'))
    expect(useProjectStore.getState().history.present.formations).toHaveLength(3)

    // The playhead sits on the last formation, which is the one that goes.
    act(() => transport.seek(8000))
    act(() => byLabel('Delete this formation (Delete)')!.click())
    expect(useProjectStore.getState().history.present.formations).toHaveLength(2)
    expect(byLabel('Stage')).not.toBeNull()

    act(() => transport.seek(4000))
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    })
    expect(useProjectStore.getState().history.present.formations).toHaveLength(1)
    expect(byLabel('Stage')).not.toBeNull()
    expect(container.textContent).toContain('Formation 1')

    act(() => byLabel('Undo (Ctrl/⌘ Z)')!.click())
    expect(byLabel('Stage')).not.toBeNull()
  })

  it('the right panel has a center-time tab listing every dancer', () => {
    act(() => useProjectStore.getState().addDancers(3))
    const tab = [...container.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === 'Center time')!
    act(() => tab.click())
    expect(tab.getAttribute('aria-selected')).toBe('true')
    const list = byLabel('Center time for each dancer')
    // One formation with no length and no video: nothing to measure yet.
    expect(list).toBeNull()
    expect(container.textContent).toContain('no time to measure yet')

    const first = useProjectStore.getState().history.present.formations[0]
    act(() => useProjectStore.getState().setFormationHold(first.id, 8000))
    expect(byLabel('Center time for each dancer')!.querySelectorAll('li')).toHaveLength(3)
    act(() => useUiStore.getState().setRightTab('inspector'))
  })

  describe('video section', () => {
    it('shows the add-video empty state with a way to choose a file', () => {
      expect(container.textContent).toContain('Add your reference video')
      expect(container.textContent).toContain('Choose video')
      expect(container.querySelector('input[type="file"]')).not.toBeNull()
    })

    it('mirrors the video picture on request and remembers the choice', () => {
      act(() => setPlayback({ video: { hash: 'h', name: 'clip.mp4', url: 'blob:clip' } as never }))
      const video = () => container.querySelector('video')!
      expect(video().className).not.toContain('-scale-x-100')
      act(() => byLabel('Mirror the video (flip left and right)')!.click())
      expect(video().className).toContain('-scale-x-100')
      expect(localStorage.getItem('fp.mirrorVideo')).toBe('1')
      act(() => byLabel('Video is mirrored: show it the normal way round')!.click())
      expect(video().className).not.toContain('-scale-x-100')
      act(() => setPlayback({ video: null }))
    })

    it('renders transport controls and the seek bar', () => {
      for (const label of ['Seek', 'Playback speed', 'Mute (M)', 'Volume']) {
        expect(byLabel(label), label).not.toBeNull()
      }
      expect(container.querySelector('[aria-label="Play (Space)"]')).not.toBeNull()
    })

    it('Space toggles playback and the play button label follows', () => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      })
      expect(usePlaybackStore.getState().playing).toBe(true)
      expect(byLabel('Pause (Space)')).not.toBeNull()
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
      })
      expect(usePlaybackStore.getState().playing).toBe(false)
    })

    it('arrow keys step frames and Home returns to the start', () => {
      act(() => transport.seek(2000))
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      })
      expect(playhead.get()).toBeGreaterThan(2000)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home' }))
      })
      expect(playhead.get()).toBe(0)
    })

    it('does not hijack Space while typing in a field', () => {
      const input = byLabel('Project name') as HTMLInputElement
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
      })
      expect(usePlaybackStore.getState().playing).toBe(false)
    })

    it('shows a friendly alert when a non-video file is chosen', async () => {
      await act(async () => {
        await loadVideoFile(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))
      })
      const alert = container.querySelector('[role="alert"]')
      expect(alert?.textContent).toContain('doesn’t look like a video')
      act(() => (alert!.querySelector('button') as HTMLButtonElement).click())
      expect(container.querySelector('[role="alert"]')).toBeNull()
    })

    it('the timeline renders with zoom controls', () => {
      for (const label of ['Timeline', 'Zoom in', 'Zoom out', 'Fit whole timeline']) {
        expect(byLabel(label), label).not.toBeNull()
      }
    })

    it('lists playback shortcuts in the cheat sheet', () => {
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }))
      })
      expect(container.textContent).toContain('Play / pause')
      expect(container.textContent).toContain('Step one frame')
    })
  })
})
