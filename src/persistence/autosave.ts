import { usePlaybackStore } from '@/store/playbackStore'
import { useProjectStore } from '@/store/projectStore'
import { writeLinkedFile } from './fileLink'
import { saveProjectRow } from './projects'

export const LAST_PROJECT_KEY = 'fp.lastProject'
const DEBOUNCE_MS = 500
const RETRY_MS = 5000

export function rememberLastProject(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id)
  } catch {
    /* storage unavailable */
  }
}

export function friendlySaveError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  if (name === 'QuotaExceededError') {
    return 'Your browser’s storage is full, so changes aren’t being saved. Save your project to a file to keep it safe.'
  }
  return 'Autosave isn’t working in this browser (private window?). Save your project to a file to keep it safe.'
}

let timer = 0

/** Save now, if there is anything to save. Resolves true when everything is stored. */
export async function flushSave(): Promise<boolean> {
  window.clearTimeout(timer)
  const { history, dirty, markSaved, setSaveError } = useProjectStore.getState()
  if (!dirty) return true
  const snapshot = history.present
  // The linked file (if any) is written even when browser storage is failing.
  const fileWrite = writeLinkedFile(snapshot)
  try {
    await saveProjectRow(snapshot)
    await fileWrite
    markSaved(snapshot)
    rememberLastProject(snapshot.id)
    return true
  } catch (err) {
    console.warn('Autosave failed', err)
    setSaveError(friendlySaveError(err))
    timer = window.setTimeout(() => void flushSave(), RETRY_MS)
    return false
  }
}

function schedule(): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => void flushSave(), DEBOUNCE_MS)
}

/** Save shortly after every change, and again when the tab is hidden or closed. */
export function startAutosave(): () => void {
  const unsub = useProjectStore.subscribe((s, prev) => {
    if (s.dirty && s.history.present !== prev.history.present) schedule()
  })
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSave()
  }
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    const s = useProjectStore.getState()
    // Unsaved edits, a failing autosave, or a video that only exists in this tab.
    if (s.dirty || s.saveError || usePlaybackStore.getState().unstoredVideo) {
      e.preventDefault()
      e.returnValue = ''
      void flushSave()
    }
  }
  document.addEventListener('visibilitychange', onHide)
  window.addEventListener('pagehide', onHide)
  window.addEventListener('beforeunload', onBeforeUnload)
  return () => {
    unsub()
    window.clearTimeout(timer)
    document.removeEventListener('visibilitychange', onHide)
    window.removeEventListener('pagehide', onHide)
    window.removeEventListener('beforeunload', onBeforeUnload)
  }
}
