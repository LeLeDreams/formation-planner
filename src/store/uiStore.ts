import { create } from 'zustand'
import type { DancerId } from '@/core/model'

export type Theme = 'dark' | 'light'
export type StageLayout = 'side-by-side' | 'overlay'
export type RightTab = 'inspector' | 'center'

const THEME_KEY = 'fp.theme'
const MIRROR_KEY = 'fp.mirrorVideo'
const CENTER_ZONE_KEY = 'fp.centerZoneWidth'

function initialCenterZone(): number | null {
  try {
    const n = Number(localStorage.getItem(CENTER_ZONE_KEY))
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function initialMirror(): boolean {
  try {
    return localStorage.getItem(MIRROR_KEY) === '1'
  } catch {
    return false
  }
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable */
  }
  return 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

interface UiState {
  theme: Theme
  stageLayout: StageLayout
  leftOpen: boolean
  rightOpen: boolean
  /** Which tab the right-hand panel shows. */
  rightTab: RightTab
  /** Width of the "center" zone for the center-time tab, in stage units; null = twice the project's minimum spacing. */
  centerZoneWidth: number | null
  setRightTab: (tab: RightTab) => void
  setCenterZoneWidth: (w: number | null) => void
  showShortcuts: boolean
  showProjects: boolean
  showExport: boolean
  selectedDancerIds: DancerId[]
  /** Smart guides while dragging (align to the center line and other dancers). */
  guides: boolean
  /** Ghost of the formation that comes next (never the previous one). */
  onion: boolean
  /** Movement path lines to the next formation. */
  paths: boolean
  /** Show the reference video flipped left-to-right (only the picture; the stage is unaffected). */
  mirrorVideo: boolean
  toggleMirrorVideo: () => void
  toggle: (key: 'guides' | 'onion' | 'paths') => void
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  setStageLayout: (l: StageLayout) => void
  toggleLeft: () => void
  toggleRight: () => void
  setShowShortcuts: (v: boolean) => void
  setShowProjects: (v: boolean) => void
  setShowExport: (v: boolean) => void
  setSelection: (ids: DancerId[]) => void
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: initialTheme(),
  stageLayout: 'side-by-side',
  leftOpen: true,
  rightOpen: true,
  rightTab: 'inspector',
  centerZoneWidth: initialCenterZone(),
  setRightTab: (rightTab) => set({ rightTab }),
  setCenterZoneWidth: (centerZoneWidth) => {
    try {
      if (centerZoneWidth === null) localStorage.removeItem(CENTER_ZONE_KEY)
      else localStorage.setItem(CENTER_ZONE_KEY, String(centerZoneWidth))
    } catch {
      /* ignore */
    }
    set({ centerZoneWidth })
  },
  showShortcuts: false,
  showProjects: false,
  showExport: false,
  selectedDancerIds: [],
  guides: true,
  onion: true,
  paths: true,
  mirrorVideo: initialMirror(),
  toggleMirrorVideo: () => {
    const mirrorVideo = !get().mirrorVideo
    try {
      localStorage.setItem(MIRROR_KEY, mirrorVideo ? '1' : '0')
    } catch {
      /* ignore */
    }
    set({ mirrorVideo })
  },
  toggle: (key) => set((s) => ({ [key]: !s[key] })),
  setTheme: (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setStageLayout: (stageLayout) => set({ stageLayout }),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
  setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
  setShowProjects: (showProjects) => set({ showProjects }),
  setShowExport: (showExport) => set({ showExport }),
  setSelection: (selectedDancerIds) => set({ selectedDancerIds }),
}))
