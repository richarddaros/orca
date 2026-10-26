import type { StateCreator } from 'zustand'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import type { Worktree } from '../../../../shared/worktree/types'
import { PINNED_GROUP_KEY } from '../../../../shared/sidebar-list/group-keys'
import {
  PINNED_CUSTOM_SECTION_ID,
  addCustomSection,
  deleteCustomSection,
  getCustomSectionIdFromGroupKey,
  moveCustomSection,
  normalizeCustomSidebarSections,
  placeCustomSectionMember,
  reconcileCustomSidebarSections,
  removeCustomSectionMember,
  renameCustomSection,
  reorderShownCustomSectionMembers,
  type CustomSidebarSectionsState
} from '../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import type { AppState } from '../types'

/** A workspace as section actions see it; worktrees also carry what Pin/Unpin needs. */
export type CustomSectionWorkspace = {
  key: string
  worktree?: Pick<Worktree, 'id' | 'hostId' | 'isPinned'>
}

/** The one section dialog open at a time; rendered by the sidebar header's dialog host. */
export type CustomSectionDialog =
  | { mode: 'create'; firstMember?: CustomSectionWorkspace }
  | { mode: 'rename'; sectionId: string; currentName: string }
  | { mode: 'delete'; sectionId: string; name: string }

/** Fork (richarddaros/orca): user sidebar sections, persisted only on this desktop. */
export type CustomSidebarSectionsSlice = {
  /** Null until the first section action, so a desktop that never used sections keeps upstream rows; always null on web. */
  customSidebarSections: CustomSidebarSectionsState | null
  customSectionDialog: CustomSectionDialog | null
  hydrateCustomSidebarSections: (value: unknown, source: 'startup' | 'sync') => void
  createCustomSection: (
    name: string,
    firstMember?: CustomSectionWorkspace
  ) => Promise<string | null>
  renameCustomSection: (sectionId: string, name: string) => Promise<void>
  moveCustomSection: (sectionId: string, delta: -1 | 1) => Promise<void>
  deleteCustomSection: (sectionId: string) => Promise<void>
  moveWorkspaceToCustomSection: (
    workspace: CustomSectionWorkspace,
    sectionId: string,
    index?: number
  ) => Promise<void>
  removeWorkspaceFromCustomSection: (workspace: CustomSectionWorkspace) => void
  /** True when the drag group is Pinned or a user section and its order was taken over. */
  reorderCustomSectionByDrag: (groupKey: string, shownKeys: readonly string[]) => boolean
  reconcileCustomSidebarSections: (visible: readonly { key: string; isPinned: boolean }[]) => void
  setCustomSectionDialog: (dialog: CustomSectionDialog | null) => void
}

function newSectionId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const createCustomSidebarSectionsSlice: StateCreator<
  AppState,
  [],
  [],
  CustomSidebarSectionsSlice
> = (set, get) => {
  let writesInFlight = 0
  const commit = (next: CustomSidebarSectionsState): void => {
    if (next === get().customSidebarSections) {
      return
    }
    set({ customSidebarSections: next })
    writesInFlight += 1
    window.api.ui
      .set({ customSidebarSections: next })
      .catch(console.error)
      .finally(() => {
        writesInFlight -= 1
      })
  }
  // Why: first use reads disk, so a degraded startup that never loaded saved sections cannot overwrite them.
  const activate = async (): Promise<CustomSidebarSectionsState | null> => {
    const current = get().customSidebarSections
    if (current || isPairedWebClientWindow()) {
      return current
    }
    try {
      const stored = (await window.api.ui.get()).customSidebarSections
      const loaded = get().customSidebarSections ?? normalizeCustomSidebarSections(stored)
      set({ customSidebarSections: loaded })
      return loaded
    } catch (error) {
      console.error(error)
      return null
    }
  }
  const edit = async (
    change: (state: CustomSidebarSectionsState) => CustomSidebarSectionsState
  ): Promise<void> => {
    const current = await activate()
    if (current) {
      commit(change(current))
    }
  }
  // Why: isPinned stays the shared source of truth for Pinned, so section moves go through Pin/Unpin.
  const setPinned = (workspace: CustomSectionWorkspace, isPinned: boolean): void => {
    if (workspace.worktree && workspace.worktree.isPinned !== isPinned) {
      get().setWorktreesPinnedAndReveal([workspace.worktree], isPinned)
    }
  }

  return {
    customSidebarSections: null,
    customSectionDialog: null,
    hydrateCustomSidebarSections: (value, source) => {
      // Why: an absent field means sections were never used; stay inactive instead of freezing Pinned.
      if (isPairedWebClientWindow() || value === undefined || value === null) {
        return
      }
      // Why: a sync echo of an older write must not undo a newer local edit still in flight.
      if (source === 'sync' && writesInFlight > 0) {
        return
      }
      const next = normalizeCustomSidebarSections(value)
      const current = get().customSidebarSections
      if (current && JSON.stringify(current) === JSON.stringify(next)) {
        return
      }
      set({ customSidebarSections: next })
    },
    createCustomSection: async (name, firstMember) => {
      const current = await activate()
      if (!current) {
        return null
      }
      const id = newSectionId()
      const next = addCustomSection(current, { id, name }, firstMember?.key)
      if (next === current) {
        return null
      }
      if (firstMember) {
        setPinned(firstMember, false)
      }
      commit(next)
      return id
    },
    renameCustomSection: (sectionId, name) =>
      edit((state) => renameCustomSection(state, sectionId, name)),
    moveCustomSection: (sectionId, delta) =>
      edit((state) => moveCustomSection(state, sectionId, delta)),
    deleteCustomSection: (sectionId) => edit((state) => deleteCustomSection(state, sectionId)),
    moveWorkspaceToCustomSection: async (workspace, sectionId, index) => {
      const current = await activate()
      if (!current) {
        return
      }
      const toPinned = sectionId === PINNED_CUSTOM_SECTION_ID
      // Why: a new pin joins Pinned through reconcile, after the order already on screen.
      const next =
        toPinned && index === undefined
          ? removeCustomSectionMember(current, workspace.key)
          : placeCustomSectionMember(current, workspace.key, sectionId, index)
      if (next === current && !toPinned) {
        return
      }
      setPinned(workspace, toPinned)
      commit(next)
    },
    removeWorkspaceFromCustomSection: (workspace) => {
      const current = get().customSidebarSections
      if (current) {
        setPinned(workspace, false)
        commit(removeCustomSectionMember(current, workspace.key))
      }
    },
    reorderCustomSectionByDrag: (groupKey, shownKeys) => {
      const current = get().customSidebarSections
      const sectionId =
        groupKey === PINNED_GROUP_KEY
          ? PINNED_CUSTOM_SECTION_ID
          : getCustomSectionIdFromGroupKey(groupKey)
      if (!current || !sectionId) {
        return false
      }
      commit(reorderShownCustomSectionMembers(current, sectionId, shownKeys))
      return true
    },
    reconcileCustomSidebarSections: (visible) => {
      const current = get().customSidebarSections
      if (current) {
        commit(reconcileCustomSidebarSections(current, visible))
      }
    },
    setCustomSectionDialog: (dialog) => set({ customSectionDialog: dialog })
  }
}
