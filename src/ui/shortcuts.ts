import { useEffect } from 'react'
import {
  addFormationHere,
  deleteCurrentFormation,
  duplicateCurrentFormation,
} from '@/features/timeline/formationActions'
import * as transport from '@/media/transport'
import { saveProjectToFile } from '@/persistence/actions'
import { flushSave } from '@/persistence/autosave'
import { canLinkFiles } from '@/persistence/fileLink'
import { useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'

export interface ShortcutDef {
  keys: string
  description: string
  group: 'General' | 'Playback' | 'Stage' | 'Timeline'
}

/** Single source of truth for the cheat sheet. Shortcuts for later milestones are listed once built. */
export const SHORTCUTS: ShortcutDef[] = [
  { keys: 'Ctrl/⌘ Z', description: 'Undo', group: 'General' },
  { keys: 'Ctrl/⌘ Shift Z', description: 'Redo', group: 'General' },
  { keys: 'Ctrl/⌘ S', description: 'Save to your file (your work also saves automatically)', group: 'General' },
  { keys: '?', description: 'Show this cheat sheet', group: 'General' },
  { keys: 'Esc', description: 'Close dialog / clear selection', group: 'General' },
  { keys: 'N', description: 'Add a formation at the playhead', group: 'Timeline' },
  { keys: 'Ctrl/⌘ D', description: 'Duplicate the formation at the playhead', group: 'Timeline' },
  { keys: 'Delete', description: 'Delete the formation at the playhead', group: 'Timeline' },
  { keys: 'Click a block', description: 'Jump to a formation; drag it to move it in time', group: 'Timeline' },
  { keys: 'Drag a block’s grip', description: 'Set how long the formation is held (Shift pushes later ones along)', group: 'Timeline' },
  { keys: 'Alt ← / →', description: 'Shorten / lengthen the focused formation’s hold (Shift = 1 s)', group: 'Timeline' },
  { keys: 'Click / Shift-click', description: 'Select dancers (Shift adds to the selection)', group: 'Stage' },
  { keys: 'Drag on empty stage', description: 'Select dancers inside a box', group: 'Stage' },
  { keys: 'Drag a dancer', description: 'Move it (all selected dancers move together)', group: 'Stage' },
  { keys: '← ↑ ↓ →', description: 'Nudge the selected dancers (Shift = 5×)', group: 'Stage' },
  { keys: 'Ctrl/⌘ A', description: 'Select every dancer (with the stage focused)', group: 'Stage' },
  { keys: '+  −  0', description: 'Zoom the stage in, out, and fit', group: 'Stage' },
  { keys: 'Scroll / pinch', description: 'Pan the stage / zoom with Ctrl or a pinch', group: 'Stage' },
  { keys: 'Space', description: 'Play / pause', group: 'Playback' },
  { keys: '← / →', description: 'Step one frame (when no dancer is selected)', group: 'Playback' },
  { keys: ',  .', description: 'Step one frame back / forward, always', group: 'Playback' },
  { keys: 'Shift ← / →', description: 'Jump 1 second back / forward', group: 'Playback' },
  { keys: 'Home', description: 'Back to the start', group: 'Playback' },
  { keys: '[  and  ]', description: 'Set loop start / end at the playhead', group: 'Playback' },
  { keys: 'L', description: 'Turn looping on / off', group: 'Playback' },
  { keys: 'M', description: 'Mute / unmute', group: 'Playback' },
  { keys: 'Ctrl/⌘ scroll', description: 'Zoom the timeline', group: 'Timeline' },
  { keys: 'Click / drag', description: 'Scrub on the timeline ruler or waveform', group: 'Timeline' },
]

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    // Space on a focused button would otherwise also "click" it when the key is released.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ' && !isTypingTarget(e.target) && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      const typing = isTypingTarget(e.target)
      const key = e.key.toLowerCase()

      if (mod && key === 's') {
        e.preventDefault()
        // Where the browser can write files, this saves to the project's file (asking where the first time).
        if (canLinkFiles()) void saveProjectToFile().catch((err) => console.warn('Save failed', err))
        else void flushSave()
        return
      }

      if (mod && key === 'z') {
        // Let text fields keep their native undo.
        if (typing) return
        e.preventDefault()
        const { undo, redo } = useProjectStore.getState()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && key === 'y') {
        if (typing) return
        e.preventDefault()
        useProjectStore.getState().redo()
        return
      }
      if (typing) return
      if (mod && key === 'd') {
        e.preventDefault()
        duplicateCurrentFormation()
        return
      }
      if (mod || e.altKey) return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          transport.toggle()
          return
        case 'ArrowLeft':
        case 'ArrowRight': {
          // Milestone 2 will use the arrows to nudge selected dancers instead.
          e.preventDefault()
          const dir = e.key === 'ArrowLeft' ? -1 : 1
          if (e.shiftKey) transport.nudge(dir)
          else transport.step(dir)
          return
        }
        case 'n':
        case 'N':
          addFormationHere()
          return
        case 'Delete':
        case 'Backspace':
          // A focused formation block handles these itself and stops them here.
          e.preventDefault()
          deleteCurrentFormation()
          return
        case ',':
          transport.step(-1)
          return
        case '.':
          transport.step(1)
          return
        case 'Home':
          e.preventDefault()
          transport.seek(0)
          return
        case '[':
          transport.setLoopStart()
          return
        case ']':
          transport.setLoopEnd()
          return
        case 'l':
        case 'L':
          transport.toggleLoop()
          return
        case 'm':
        case 'M':
          transport.toggleMute()
          return
      }

      if (e.key === '?') {
        e.preventDefault()
        const ui = useUiStore.getState()
        ui.setShowShortcuts(!ui.showShortcuts)
        return
      }
      if (e.key === 'Escape') {
        const ui = useUiStore.getState()
        if (ui.showShortcuts) ui.setShowShortcuts(false)
        else if (ui.selectedDancerIds.length) ui.setSelection([])
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])
}
