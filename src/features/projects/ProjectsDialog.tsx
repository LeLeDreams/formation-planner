import { Download, FilePlus, FolderOpen, Sparkles, Trash2, Upload, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  deleteProject,
  importProjectFile,
  loadSampleProject,
  newProject,
  openProject,
  openProjectFile,
  saveProjectAs,
} from '@/persistence/actions'
import { canLinkFiles, useFileLinkStore } from '@/persistence/fileLink'
import { listProjects, type ProjectSummary } from '@/persistence/projects'
import { selectProject, useProjectStore } from '@/store/projectStore'
import { useUiStore } from '@/store/uiStore'
import { Button } from '@/ui/primitives'

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`
  return new Date(iso).toLocaleDateString()
}

export function ProjectsDialog() {
  const open = useUiStore((s) => s.showProjects)
  const setOpen = useUiStore((s) => s.setShowProjects)
  const currentId = useProjectStore((s) => selectProject(s).id)
  const [rows, setRows] = useState<ProjectSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const linkable = canLinkFiles()
  const fileName = useFileLinkStore((s) => s.fileName)

  const refresh = useCallback(async () => {
    try {
      setRows(await listProjects())
    } catch {
      setRows([])
      setError('Saved projects couldn’t be read in this browser.')
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmId(null)
    void refresh()
    closeRef.current?.focus()
  }, [open, refresh])

  if (!open) return null

  // An action resolves to an error message, or `false` if the user backed out of a file picker.
  const run = async (fn: () => Promise<void | string | null | boolean>, closeAfter = true) => {
    setBusy(true)
    setError(null)
    try {
      const msg = await fn()
      if (typeof msg === 'string') setError(msg)
      else if (closeAfter && msg !== false) setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
      void refresh()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
      onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Projects"
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-panel shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="text-base font-semibold">Projects</h2>
          <Button ref={closeRef} label="Close" onClick={() => setOpen(false)}>
            <X size={16} />
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-line px-5 py-3">
          <Button variant="solid" disabled={busy} onClick={() => run(newProject)}>
            <FilePlus size={15} /> New project
          </Button>
          <Button
            variant="subtle"
            disabled={busy}
            onClick={() => (linkable ? void run(openProjectFile) : fileRef.current?.click())}
          >
            <Upload size={15} /> Open file
          </Button>
          <Button variant="subtle" disabled={busy} onClick={() => run(loadSampleProject)}>
            <Sparkles size={15} /> Sample routine
          </Button>
          <Button variant="subtle" disabled={busy} onClick={() => run(saveProjectAs, false)}>
            <Download size={15} /> {linkable ? 'Save as…' : 'Download this project'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            aria-label="Open a project file"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0]
              e.currentTarget.value = ''
              if (file) void run(() => importProjectFile(file))
            }}
          />
        </div>

        {error && (
          <p role="alert" className="mx-5 mt-3 rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        )}

        <ul className="min-h-0 flex-1 space-y-1 overflow-auto p-3" aria-label="Saved projects">
          {rows.length === 0 && <li className="px-2 py-6 text-center text-muted">No saved projects yet.</li>}
          {rows.map((r) => {
            const isCurrent = r.id === currentId
            return (
              <li
                key={r.id}
                className={
                  'flex items-center gap-3 rounded-xl border px-3 py-2 ' +
                  (isCurrent ? 'border-accent-strong bg-raised' : 'border-transparent hover:bg-panel2')
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.name || 'Untitled'}</p>
                  <p className="text-[12px] text-muted">
                    {r.dancers} dancers · {r.formations} formations · {timeAgo(r.updatedAt)}
                  </p>
                </div>
                {isCurrent ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-fg">Open</span>
                ) : (
                  <Button variant="subtle" disabled={busy} onClick={() => run(() => openProject(r.id))}>
                    <FolderOpen size={14} /> Open
                  </Button>
                )}
                {confirmId === r.id ? (
                  <Button
                    variant="subtle"
                    className="text-danger"
                    disabled={busy}
                    onClick={() => {
                      setConfirmId(null)
                      void run(() => deleteProject(r.id), false)
                    }}
                  >
                    Really delete?
                  </Button>
                ) : (
                  <Button label={`Delete ${r.name}`} disabled={busy} onClick={() => setConfirmId(r.id)}>
                    <Trash2 size={14} />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        <p className="border-t border-line px-5 py-2.5 text-[11px] leading-relaxed text-muted">
          {fileName
            ? `This project saves to ${fileName} on your computer, and in this browser. `
            : linkable
              ? 'Projects save automatically in this browser. Use “Save as…” to also keep one in a file on your computer; it then stays up to date as you work. '
              : 'Projects save automatically in this browser. Download a copy to back up or move your formations. '}
          Videos are stored in this browser and aren’t part of the file.
        </p>
      </div>
    </div>
  )
}
