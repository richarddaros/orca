import type React from 'react'
import { useAppStore } from '@/store'
import type { CustomSectionWorkspace } from '@/store/slices/custom-sidebar-sections'
import {
  CUSTOM_SECTION_KEY_PREFIX,
  PINNED_CUSTOM_SECTION_ID,
  getCustomSectionIdFromGroupKey,
  getCustomSectionIdOfGroupKey
} from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { PINNED_GROUP_KEY } from '../../../../../shared/sidebar-list/group-keys'
import { getWorktreeHostIdentity } from '../../../../../shared/worktree/host-qualified-identity'
import { parseWorkspaceKey } from '../../../../../shared/workspace-scope'
import type { WorkspaceStatus } from '../../../../../shared/worktree/types'
import { clearWorkspaceKanbanSidebarDropTargetVisual } from '../workspace-kanban-sidebar-drop'
import type { WorktreeSidebarDropPreview } from '../worktree-sidebar-drop-preview'
import type { WorktreeDropCommitContext } from '../worktree-list/drag/drop-commit-context'
import { dropWriteRows } from '../worktree-list/drag/dragged-worktree-copies'
import {
  EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
  applyWorktreeDropPreview,
  type WorktreePointerDrag,
  type WorktreeRowDragState
} from '../worktree-list/drag/row-state'

// Fork (richarddaros/orca): dragging a card from another group into Pinned or a user section.

type SectionDropTarget = {
  groupKey: string
  preview: WorktreeSidebarDropPreview
  // On the section title: the card goes to the top, under the line drawn below the title.
  atTop: boolean
}

type SectionDropArgs = {
  drag: WorktreePointerDrag
  ctx: WorktreeDropCommitContext
  x: number
  y: number
}

type GroupHit = { groupKey: string; header: HTMLElement | null } | null

// Same padding the upstream drop bounds allow around a group's cards; wider would take other groups' gaps.
const CARD_GAP_PADDING_PX = 8
// Same tolerance as the status drop, for a pointer released where no row is hit.
const TRACKED_TARGET_TOLERANCE_PX = 6
const trackedTargets = new WeakMap<
  WorktreePointerDrag,
  { target: SectionDropTarget; x: number; y: number }
>()

function isSectionGroupKey(groupKey: string): boolean {
  return getCustomSectionIdOfGroupKey(groupKey) !== null
}

/** Header rows are keyed `hdr:[<hostId>:]<group key>` by the sidebar virtualizer. */
function getHeaderGroupKey(header: Element): string | null {
  // Why: Pinned's title already carries the upstream pin target; a status may also be called "pinned".
  if (header.querySelector('[data-workspace-pin-drop-target]')) {
    return PINNED_GROUP_KEY
  }
  const key = header.getAttribute('data-worktree-virtual-row-key')
  if (!key?.startsWith('hdr:')) {
    return null
  }
  const rest = key.slice('hdr:'.length)
  const sectionAt = rest.indexOf(CUSTOM_SECTION_KEY_PREFIX)
  return sectionAt === -1 ? rest : rest.slice(sectionAt)
}

function isPointInRect(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

/** The list group under the pointer: a title's group key or a card's section key. */
function getGroupAt(container: HTMLElement, x: number, y: number): GroupHit {
  if (!isPointInRect(container.getBoundingClientRect(), x, y)) {
    return null
  }
  const target = document.elementFromPoint(x, y)
  if (!(target instanceof Element) || !container.contains(target)) {
    return null
  }
  const header = target.closest<HTMLElement>('[data-worktree-sticky-header]')
  const headerKey = header ? getHeaderGroupKey(header) : null
  if (header && headerKey) {
    return { groupKey: headerKey, header }
  }
  const cardKey = target
    .closest('[data-worktree-section-key]')
    ?.getAttribute('data-worktree-section-key')
  return cardKey ? { groupKey: cardKey, header: null } : null
}

/** A section whose card sits within a row gap of the pointer, other than the drag's own group. */
function getSectionNextToGap(
  container: HTMLElement,
  sourceGroupKey: string,
  x: number,
  y: number
): string | null {
  // Why: virtualized cards in overscan sit past the container edge; a drop outside the sidebar is not theirs.
  if (!isPointInRect(container.getBoundingClientRect(), x, y)) {
    return null
  }
  for (const row of container.querySelectorAll<HTMLElement>('[data-worktree-drag-group-key]')) {
    const groupKey = row.getAttribute('data-worktree-drag-group-key')
    if (!groupKey || groupKey === sourceGroupKey || !isSectionGroupKey(groupKey)) {
      continue
    }
    const rect = row.getBoundingClientRect()
    if (y >= rect.top - CARD_GAP_PADDING_PX && y <= rect.bottom + CARD_GAP_PADDING_PX) {
      return groupKey
    }
  }
  return null
}

function getTitleInsertionPreview(
  container: HTMLElement,
  header: HTMLElement
): WorktreeSidebarDropPreview {
  const containerTop = container.getBoundingClientRect().top
  return {
    dropIndex: 0,
    dropIndicatorY: header.getBoundingClientRect().bottom - containerTop + container.scrollTop,
    previewOffsetsByWorktreeId: EMPTY_WORKTREE_DRAG_PREVIEW_OFFSETS,
    dropAnchorId: null
  }
}

function getHit(args: SectionDropArgs): GroupHit {
  const container = args.ctx.scrollRef.current
  return container ? getGroupAt(container, args.x, args.y) : null
}

/** Folder workspaces have no section actions yet, so a folder-only drag leaves user-section drops to upstream. */
function isFolderOnlyDrag(drag: WorktreePointerDrag): boolean {
  return drag.draggedIds.every((worktreeId) => parseWorkspaceKey(worktreeId)?.type === 'folder')
}

function findSectionDropTarget(args: SectionDropArgs, hit: GroupHit): SectionDropTarget | null {
  const container = args.ctx.scrollRef.current
  const computeGroupDrop = args.ctx.computeWorktreeGroupDrop
  if (!useAppStore.getState().customSidebarSections || !container || !computeGroupDrop) {
    return null
  }
  const folderOnly = isFolderOnlyDrag(args.drag)
  const takesDrop = (groupKey: string): boolean =>
    groupKey !== args.drag.sourceGroupKey &&
    isSectionGroupKey(groupKey) &&
    !(folderOnly && groupKey !== PINNED_GROUP_KEY)
  if (hit?.header) {
    return takesDrop(hit.groupKey)
      ? {
          groupKey: hit.groupKey,
          preview: getTitleInsertionPreview(container, hit.header),
          atTop: true
        }
      : null
  }
  // Why: between two cards the pointer hits no row; only a section card right next to it counts.
  const groupKey = hit
    ? hit.groupKey
    : getSectionNextToGap(container, args.drag.sourceGroupKey, args.x, args.y)
  if (!groupKey || !takesDrop(groupKey)) {
    return null
  }
  const preview = computeGroupDrop({
    pointerY: args.y,
    groupKey,
    draggedKeys: args.drag.reorderDraggedKeys
  })
  return preview ? { groupKey, preview, atTop: false } : null
}

/** Shows the insertion line in the target section; false leaves the frame to the upstream preview. */
export function previewCustomSectionDrop(args: {
  drag: WorktreePointerDrag
  ctx: WorktreeDropCommitContext
  setWorktreeDragState: React.Dispatch<React.SetStateAction<WorktreeRowDragState>>
  setDragOverStatus: (status: WorkspaceStatus | null) => void
  setPinDragOver: (pinDragOver: boolean) => void
}): boolean {
  const { drag } = args
  const position = { drag, ctx: args.ctx, x: drag.currentX, y: drag.currentY }
  const target = findSectionDropTarget(position, getHit(position))
  // Why: upstream pins a folder-only drag at the end of Pinned, so an insertion line would promise a position it ignores.
  if (!target || (target.groupKey === PINNED_GROUP_KEY && isFolderOnlyDrag(drag))) {
    trackedTargets.delete(drag)
    return false
  }
  trackedTargets.set(drag, { target, x: drag.currentX, y: drag.currentY })
  drag.reorderIntent = null
  drag.latestStatusDropTarget = null
  clearWorkspaceKanbanSidebarDropTargetVisual()
  args.setDragOverStatus(null)
  args.setPinDragOver(false)
  args.setWorktreeDragState((prev) =>
    applyWorktreeDropPreview(prev, target.preview, { pointerY: drag.currentY, matchPointerY: true })
  )
  return true
}

function getDraggedWorkspaces(drag: WorktreePointerDrag): CustomSectionWorkspace[] {
  const rowsFor = dropWriteRows(useAppStore.getState(), drag.draggedCopies)
  // Why: folder workspaces have no section actions yet, same as the card menu.
  return drag.draggedIds
    .flatMap((worktreeId) => rowsFor.status(worktreeId))
    .filter((worktree) => parseWorkspaceKey(worktree.id)?.type !== 'folder')
    .map((worktree) => ({ key: getWorktreeHostIdentity(worktree), worktree }))
}

/** The stored member the drop goes before: the first one shown from the line down, else the end. */
function getBeforeKey(args: SectionDropArgs, target: SectionDropTarget): string | null {
  const sectionId = getCustomSectionIdOfGroupKey(target.groupKey)
  const section = useAppStore
    .getState()
    .customSidebarSections?.sections.find((candidate) => candidate.id === sectionId)
  if (!section) {
    return null
  }
  if (target.atTop) {
    return section.members[0] ?? null
  }
  const members = new Set(section.members)
  // Why: the drag groups and the preview anchor already hold host identities, the same keys the section stores.
  const shownKeys = args.ctx.worktreeDragUnitGroups.find(
    (group) => group.key === target.groupKey
  )?.worktreeIds
  const anchorKey = target.preview.dropAnchorId
  const shownFromLine = shownKeys
    ? shownKeys.slice(target.preview.dropIndex)
    : anchorKey
      ? [anchorKey]
      : []
  return shownFromLine.find((key) => members.has(key)) ?? null
}

/** A user-section card dropped on the regular list leaves its section; upstream still applies the drop. */
function leaveSourceSectionForList(args: SectionDropArgs, hit: GroupHit): void {
  if (
    getCustomSectionIdFromGroupKey(args.drag.sourceGroupKey) === null ||
    !hit ||
    isSectionGroupKey(hit.groupKey)
  ) {
    return
  }
  const state = useAppStore.getState()
  const userSections = (state.customSidebarSections?.sections ?? []).filter(
    (section) => section.id !== PINNED_CUSTOM_SECTION_ID
  )
  for (const workspace of getDraggedWorkspaces(args.drag)) {
    // Why: a multi-selection can also carry Pinned cards, and dragging out of Pinned never unpins.
    if (
      !workspace.worktree?.isPinned &&
      userSections.some((section) => section.members.includes(workspace.key))
    ) {
      state.removeWorkspaceFromCustomSection(workspace)
    }
  }
}

/** Commits a drop into Pinned or a user section; false leaves the drop to upstream. */
export function commitCustomSectionDrop(args: SectionDropArgs): boolean {
  const tracked = trackedTargets.get(args.drag)
  trackedTargets.delete(args.drag)
  const state = useAppStore.getState()
  if (!state.customSidebarSections) {
    return false
  }
  const hit = getHit(args)
  const target =
    findSectionDropTarget(args, hit) ??
    (!hit &&
    tracked &&
    Math.abs(tracked.x - args.x) <= TRACKED_TARGET_TOLERANCE_PX &&
    Math.abs(tracked.y - args.y) <= TRACKED_TARGET_TOLERANCE_PX
      ? tracked.target
      : null)
  if (!target) {
    leaveSourceSectionForList(args, hit)
    return false
  }
  const workspaces = getDraggedWorkspaces(args.drag)
  const beforeKey = getBeforeKey(args, target)
  if (target.groupKey === PINNED_GROUP_KEY) {
    // Why: Pin keeps upstream's drop path (folders, a full Pinned); the section only keeps the order.
    args.ctx.onPinWorktrees(args.drag.draggedIds)
    state.dropWorkspacesIntoCustomSection(
      workspaces.map(({ key }) => ({ key })),
      target.groupKey,
      beforeKey
    )
    return true
  }
  state.dropWorkspacesIntoCustomSection(workspaces, target.groupKey, beforeKey)
  return true
}
