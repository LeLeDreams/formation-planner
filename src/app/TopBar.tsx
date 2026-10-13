import { AlertTriangle, Check, Clapperboard, FolderOpen, Keyboard, LayoutPanelLeft, Loader2, Moon, PanelLeft, PanelRight, Redo2, Save, Sun, Undo2 } from 'lucide-react'
import { saveProjectToFile } from '@/persistence/actions'
import { canLinkFiles, useFileLinkStore } from '@/persistence/fileLink'
import { selectCanRedo, selectCanUndo, selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { Button, TextInput } from '@/ui/primitives'

const saveToFile = () => void saveProjectToFile().catch((err) => console.warn('Save failed', err))

/** Where the project is saved right now: in the browser, in a file on disk, or not at all. */
function SaveStatus() {
  const dirty = useProjectStore((s) => s.dirty)
  const saveError = useProjectStore((s) => s.saveError)
  const fileName = useFileLinkStore((s) => s.fileName)
  const fileStatus = useFileLinkStore((s) => s.status)
  const base = 'flex min-w-0 items-center gap-1 whitespace-nowrap text-[11px] '
  const name = <span className="max-w-40 truncate">{fileName}</span>

  if (saveError && fileStatus !== 'saved') {
    return (
      <span className={base + 'text-danger'} role="status" title={saveError}>
        <AlertTriangle size={13} /> Not saved
      </span>
    )
  }
  if (dirty || fileStatus === 'saving') {
    return (
      <span className={base + 'text-muted'} role="status">
        <Loader2 size={13} className="animate-spin" /> Saving…
      </span>
    )
  }
  if (fileStatus === 'needs-permission' || fileStatus === 'error') {
    const waiting = fileStatus === 'needs-permission'
    return (
      <button
        type="button"
        role="status"
        className={base + 'rounded-md px-1.5 py-1 text-danger hover:bg-raised'}
        title={
          waiting
            ? `Your work is saved in this browser, but the browser needs your OK before it can update ${fileName} again. Click to allow it.`
            : `Your work is saved in this browser, but ${fileName} couldn’t be updated. Click to try again.`
        }
        onClick={saveToFile}
      >
        <AlertTriangle size={13} /> {waiting ? 'Reconnect' : 'Couldn’t update'} {name}
      </button>
    )
  }
  if (fileStatus === 'saved') {
    return (
      <span
        className={base + 'text-muted'}
        role="status"
        title={saveError ?? `Every change is saved to ${fileName} on your computer, and in this browser.`}
      >
        <Check size={13} /> Saved to {name}
        {saveError && ' only'}
      </span>
    )
  }
  return (
    <span
      className={base + 'text-muted'}
      role="status"
      title="Your work is saved automatically in this browser. Use Save to keep it in a file on your computer."
    >
      <Check size={13} /> Saved in this browser
    </span>
  )
}

export function TopBar() {
  const project = useProjectStore(selectProject)
  const fileName = useFileLinkStore((s) => s.fileName)
  const canUndo = useProjectStore(selectCanUndo)
  const canRedo = useProjectStore(selectCanRedo)
  const { undo, redo, setName } = useProjectStore.getState()

  const theme = useUiStore((s) => s.theme)
  const toggleTheme = useUiStore((s) => s.toggleTheme)
  const layout = useUiStore((s) => s.stageLayout)
  const setLayout = useUiStore((s) => s.setStageLayout)
  const leftOpen = useUiStore((s) => s.leftOpen)
  const rightOpen = useUiStore((s) => s.rightOpen)
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const toggleRight = useUiStore((s) => s.toggleRight)
  const setShowShortcuts = useUiStore((s) => s.setShowShortcuts)
  const setShowProjects = useUiStore((s) => s.setShowProjects)
  const setShowExport = useUiStore((s) => s.setShowExport)

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3">
      <Button label="Toggle dancer roster" active={leftOpen} onClick={toggleLeft}>
        <PanelLeft size={16} />
      </Button>

      <div className="flex items-center gap-2">
        <TextInput
          aria-label="Project name"
          className="w-52 border-transparent bg-transparent font-medium hover:border-line"
          value={project.name}
          onChange={(e) => setName(e.target.value)}
        />
        <SaveStatus />
      </div>

      <div className="mx-2 h-5 w-px bg-line" />
      <Button label="Undo (Ctrl/⌘ Z)" disabled={!canUndo} onClick={undo}>
        <Undo2 size={16} />
      </Button>
      <Button label="Redo (Ctrl/⌘ Shift Z)" disabled={!canRedo} onClick={redo}>
        <Redo2 size={16} />
      </Button>

      <Button
        label={
          fileName
            ? `Save to ${fileName} (Ctrl/⌘ S)`
            : canLinkFiles()
              ? 'Save to a file on your computer (Ctrl/⌘ S)'
              : 'Download this project as a file'
        }
        onClick={saveToFile}
      >
        <Save size={16} />
        <span className="hidden md:inline">{fileName ? 'Save' : 'Save to file'}</span>
      </Button>
      <Button label="Projects: open, new, or save as a file" onClick={() => setShowProjects(true)}>
        <FolderOpen size={16} />
        <span className="hidden md:inline">Projects</span>
      </Button>
      <Button label="Export a video of the formations" onClick={() => setShowExport(true)}>
        <Clapperboard size={16} />
        <span className="hidden lg:inline">Export video</span>
      </Button>

      <div className="flex-1" />

      <Button
        label="Toggle video/stage overlay"
        active={layout === 'overlay'}
        onClick={() => setLayout(layout === 'overlay' ? 'side-by-side' : 'overlay')}
      >
        <LayoutPanelLeft size={16} />
        <span className="hidden lg:inline">{layout === 'overlay' ? 'Overlay' : 'Side by side'}</span>
      </Button>
      <Button label="Keyboard shortcuts (?)" onClick={() => setShowShortcuts(true)}>
        <Keyboard size={16} />
      </Button>
      <Button label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggleTheme}>
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </Button>
      <Button label="Toggle inspector" active={rightOpen} onClick={toggleRight}>
        <PanelRight size={16} />
      </Button>
    </header>
  )
}
