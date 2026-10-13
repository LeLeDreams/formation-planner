import { useEffect, useState } from 'react'
import { TimelinePanel } from '@/app/TimelinePanel'
import { TopBar } from '@/app/TopBar'
import { Workspace } from '@/app/Workspace'
import { ExportDialog } from '@/features/export/ExportDialog'
import { InspectorPanel } from '@/features/inspector/InspectorPanel'
import { ProjectsDialog } from '@/features/projects/ProjectsDialog'
import { RosterPanel } from '@/features/roster/RosterPanel'
import { startMediaSync } from '@/media/mediaSync'
import { openInitialProject } from '@/persistence/actions'
import { startAutosave } from '@/persistence/autosave'
import { applyTheme, useUiStore } from '@/store/uiStore'
import { ShortcutsDialog } from '@/ui/ShortcutsDialog'
import { useGlobalShortcuts } from '@/ui/shortcuts'

export default function App() {
  useGlobalShortcuts()
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)

  useEffect(() => {
    applyTheme(useUiStore.getState().theme)
  }, [])

  // Open the last project before anything else, so we never show (or save over) a blank one.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    void openInitialProject().finally(() => !cancelled && setReady(true))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    const stopSave = startAutosave()
    // Keep the loaded video in line with the project's media reference.
    const stopMedia = startMediaSync()
    return () => {
      stopSave()
      stopMedia()
    }
  }, [ready])

  if (!ready) {
    return <div className="grid h-full place-items-center text-muted">Opening your project…</div>
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {leftOpen && <RosterPanel />}
        <Workspace />
        {rightOpen && <InspectorPanel />}
      </div>
      <TimelinePanel />
      <ShortcutsDialog />
      <ProjectsDialog />
      <ExportDialog />
    </div>
  )
}
