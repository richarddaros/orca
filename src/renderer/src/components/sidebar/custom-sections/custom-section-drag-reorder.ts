import { useAppStore } from '@/store'
import {
  PINNED_CUSTOM_SECTION_ID,
  getCustomSectionIdFromGroupKey
} from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { PINNED_GROUP_KEY } from '../../../../../shared/sidebar-list/group-keys'
import { composeWorktreeHostIdentity } from '../../../../../shared/worktree/host-qualified-identity'
import {
  getVisibleWorktreeShortcutTargets,
  type VisibleWorktreeShortcutTarget
} from '../visible-worktrees'
import { moveWorktreeIdsWithinGroup, type WorktreeDragGroup } from '../worktree-manual-order'

/**
 * Drag groups carry bare ids; resolve each through the shown rows, preferring the section's own member
 * so a twin on another host (shown elsewhere or hidden) never takes its place.
 */
export function resolveShownSectionKeys(
  worktreeIds: readonly string[],
  shownTargets: readonly VisibleWorktreeShortcutTarget[],
  members: ReadonlySet<string>
): string[] {
  const keysById = new Map<string, string[]>()
  for (const target of shownTargets) {
    const keys = keysById.get(target.id) ?? []
    keys.push(composeWorktreeHostIdentity(target.executionHostId, target.id))
    keysById.set(target.id, keys)
  }
  return worktreeIds.flatMap((id) => {
    const keys = keysById.get(id) ?? []
    const memberIndex = keys.findIndex((key) => members.has(key))
    return keys.splice(memberIndex === -1 ? 0 : memberIndex, 1)
  })
}

/** Fork (richarddaros/orca): a drag inside Pinned or a user section reorders that section and keeps the sort. */
export function reorderCustomSectionByDrag(args: {
  groups: readonly WorktreeDragGroup[]
  sourceGroupKey: string
  draggedIds: readonly string[]
  dropIndex: number
}): boolean {
  const state = useAppStore.getState()
  // Why: before first use (or on web) Pinned keeps upstream's manual-order drag.
  if (
    !state.customSidebarSections ||
    (args.sourceGroupKey !== PINNED_GROUP_KEY &&
      getCustomSectionIdFromGroupKey(args.sourceGroupKey) === null)
  ) {
    return false
  }
  const group = args.groups.find((candidate) => candidate.key === args.sourceGroupKey)
  const sectionId = getCustomSectionIdFromGroupKey(args.sourceGroupKey) ?? PINNED_CUSTOM_SECTION_ID
  const members = new Set(
    state.customSidebarSections.sections.find((section) => section.id === sectionId)?.members
  )
  return group
    ? state.reorderCustomSectionByDrag(
        args.sourceGroupKey,
        resolveShownSectionKeys(
          moveWorktreeIdsWithinGroup(group.worktreeIds, args.draggedIds, args.dropIndex),
          getVisibleWorktreeShortcutTargets(),
          members
        )
      )
    : false
}
