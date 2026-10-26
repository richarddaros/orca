import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { useAppStore } from '@/store'
import {
  createInitialCustomSidebarSections,
  type CustomSidebarSectionsState
} from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'

const NOT_YET_USED = createInitialCustomSidebarSections()

/** Sections the header and menus offer; before first use only Pinned, so any section action can start them. */
export function useShownCustomSidebarSections(): CustomSidebarSectionsState | null {
  const sections = useAppStore((s) => s.customSidebarSections)
  const ready = useAppStore((s) => s.persistedUIReady)
  if (isPairedWebClientWindow() || !ready) {
    return null
  }
  return sections ?? NOT_YET_USED
}
