import { useAppStore } from '@/store'
import { getCustomSectionIdFromGroupKey } from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { PINNED_GROUP_KEY } from '../../../../../shared/sidebar-list/group-keys'
import { moveWorktreeIdsWithinGroup, type WorktreeDragGroup } from '../worktree-manual-order'

/** Fork (richarddaros/orca): a drag inside Pinned or a user section reorders that section and keeps the sort. */
export function reorderCustomSectionByDrag(args: {
  groups: readonly WorktreeDragGroup[]
  sourceGroupKey: string
  /** Host identities, as the drag groups key their members. */
  draggedKeys: readonly string[]
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
  return group
    ? state.reorderCustomSectionByDrag(
        args.sourceGroupKey,
        moveWorktreeIdsWithinGroup(group.worktreeIds, args.draggedKeys, args.dropIndex)
      )
    : false
}
