// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomSidebarSectionsState } from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import type { WorktreeDropCommitContext } from '../worktree-list/drag/drop-commit-context'
import { commitWorktreePointerDrop } from '../worktree-list/drag/pointer-commit'
import {
  WORKTREE_ROW_DRAG_INITIAL_STATE,
  type WorktreePointerDrag,
  type WorktreeRowDragState
} from '../worktree-list/drag/row-state'
import { commitCustomSectionDrop, previewCustomSectionDrop } from './custom-section-drop'

// Fork (richarddaros/orca): drag into Pinned or a user section from another group.
const store = vi.hoisted(() => {
  const state: {
    customSidebarSections: CustomSidebarSectionsState | null
    dropWorkspacesIntoCustomSection: ReturnType<typeof vi.fn>
    removeWorkspaceFromCustomSection: ReturnType<typeof vi.fn>
  } = {
    customSidebarSections: null,
    dropWorkspacesIntoCustomSection: vi.fn(),
    removeWorkspaceFromCustomSection: vi.fn()
  }
  return state
})

const board = vi.hoisted(() => {
  const commitTarget: { status: string | null; isPinDrop: boolean } = {
    status: null,
    isPinDrop: false
  }
  return { commitTarget }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))
vi.mock('../workspace-kanban-sidebar-drop', () => ({
  clearWorkspaceKanbanSidebarDropTargetVisual: vi.fn(),
  getWorkspaceKanbanSidebarDropGroups: () => [],
  getWorkspaceKanbanSidebarDropTarget: () => ({ status: null, isPinDrop: false }),
  isWorkspaceKanbanSidebarDropPointInBoard: () => false,
  resolveWorkspaceKanbanSidebarFullLaneDropIndex: () => 0
}))
vi.mock('../workspace-kanban-card-pointer-drag-dom', () => ({
  resolveWorkspaceKanbanCardDropCommitTarget: () => board.commitTarget
}))
// `a` was dragged from the ssh host (a twin exists locally); `p` is pinned; `folder:f1` is a folder workspace;
// `child` is a lineage child that rides along with `a` without being dragged itself.
vi.mock('../worktree-list/drag/dragged-worktree-copies', () => ({
  dropWriteRows: () => ({
    status: (id: string) =>
      id === 'a'
        ? [{ id: 'a', hostId: 'ssh:box', isPinned: false }]
        : id === 'p'
          ? [{ id: 'p', hostId: 'local', isPinned: true }]
          : id === 'folder:f1'
            ? [{ id: 'folder:f1', hostId: 'local', isPinned: false }]
            : id === 'child'
              ? [{ id: 'child', hostId: 'local', isPinned: false }]
              : id === 'q'
                ? [{ id: 'q', hostId: 'local', isPinned: false }]
                : []
  })
}))
vi.mock('../visible-worktrees', () => ({
  getVisibleWorktreeShortcutTargets: () => [
    { id: 'z', executionHostId: 'local' },
    { id: 'c', executionHostId: 'local' },
    { id: 'b', executionHostId: 'ssh:box' },
    { id: 'b', executionHostId: 'local' },
    { id: 'p', executionHostId: 'local' }
  ]
}))

function element(attributes: Record<string, string>): HTMLElement {
  const node = document.createElement('div')
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value)
  }
  return node
}

const container = document.createElement('div')
const sectionCard = element({
  'data-worktree-section-key': 'custom-section:s1',
  'data-worktree-drag-group-key': 'custom-section:s1'
})
const sectionTitle = element({
  'data-worktree-sticky-header': '',
  'data-worktree-virtual-row-key': 'hdr:ssh:box:custom-section:s1'
})
const pinnedTitle = element({
  'data-worktree-sticky-header': '',
  'data-worktree-virtual-row-key': 'hdr:pinned'
})
pinnedTitle.append(element({ 'data-workspace-pin-drop-target': '' }))
// A Pinned card inside a status group also carries the upstream status drop target.
const pinnedCard = element({
  'data-worktree-section-key': 'pinned',
  'data-worktree-drag-group-key': 'pinned',
  'data-workspace-status-drop-target': '',
  'data-workspace-status': 'in-review'
})
const repoTitle = element({
  'data-worktree-sticky-header': '',
  'data-worktree-virtual-row-key': 'hdr:repo:r1'
})
const statusTitle = element({
  'data-worktree-sticky-header': '',
  'data-worktree-virtual-row-key': 'hdr:workspace-status:pinned'
})
const repoCard = element({ 'data-worktree-section-key': 'repo:r1' })
// Titles of a collapsed section (no card rendered) and of an empty one.
const collapsedTitle = element({
  'data-worktree-sticky-header': '',
  'data-worktree-virtual-row-key': 'hdr:custom-section:s2'
})
const emptyTitle = element({
  'data-worktree-sticky-header': '',
  'data-worktree-virtual-row-key': 'hdr:custom-section:s3'
})
container.append(
  sectionCard,
  sectionTitle,
  pinnedTitle,
  statusTitle,
  repoCard,
  collapsedTitle,
  emptyTitle,
  pinnedCard,
  repoTitle
)

function rect(top: number, bottom: number): DOMRect {
  return new DOMRect(0, top, 240, bottom - top)
}

function makeDrag(
  sourceGroupKey: string,
  draggedIds: string[] = ['a'],
  draggedCopies: WorktreePointerDrag['draggedCopies'] = [{ id: 'a', hostId: 'ssh:box' }]
): WorktreePointerDrag {
  return {
    pointerId: 1,
    sourceRow: document.createElement('div'),
    startX: 50,
    startY: 50,
    currentX: 50,
    currentY: 180,
    worktreeId: draggedIds[0]!,
    draggedIds,
    draggedCopies,
    reorderDraggedIds: draggedIds,
    reorderUnitDraggedIds: draggedIds,
    sourceGroupKey,
    rects: [],
    active: true,
    preview: null,
    previewOffsetX: 0,
    previewOffsetY: 0,
    workspaceBoardDragPreviewRequested: false,
    frameId: null,
    reorderIntent: null,
    latestBoardDropTarget: null,
    latestStatusDropTarget: null
  }
}

function makeCtx(overrides: Partial<WorktreeDropCommitContext> = {}): WorktreeDropCommitContext {
  return {
    scrollRef: { current: container },
    workspaceStatuses: [],
    worktreeDragGroups: [],
    // Like the real producer: `worktreeIds` lists unit leaders only; a lineage child (`c`) rides inside its parent's unit.
    worktreeDragUnitGroups: [
      {
        key: 'custom-section:s1',
        worktreeIds: ['z', 'b'],
        units: [
          { worktreeId: 'z', worktreeIds: ['z'] },
          { worktreeId: 'b', worktreeIds: ['b', 'c'] }
        ]
      }
    ],
    computeWorktreeDrop: () => null,
    computeWorktreeStatusDrop: () => null,
    computeWorktreeGroupDrop: ({ groupKey }) =>
      groupKey === 'custom-section:s1'
        ? {
            dropIndex: 1,
            dropIndicatorY: 120,
            previewOffsetsByWorktreeId: new Map(),
            dropAnchorId: 'c'
          }
        : null,
    refreshWorktreeDragSession: () => true,
    getEligibleLineageDropTarget: (target) => target,
    commitWorktreeLineageParentDrop: vi.fn(() => true),
    clearReorderedWorktreeParents: vi.fn(),
    clearWorktreeDrag: vi.fn(),
    onMoveWorktreesToStatus: vi.fn(),
    onMoveWorktreesToStatusAtIndex: vi.fn(),
    onReorderWorktrees: vi.fn(),
    onPinWorktrees: vi.fn(),
    ...overrides
  }
}

function pointAt(target: Element | null): void {
  vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)
}

describe('custom section drop', () => {
  beforeEach(() => {
    board.commitTarget = { status: null, isPinDrop: false }
    store.customSidebarSections = {
      version: 1,
      sections: [
        { id: 'pinned', name: '', members: ['local|p'] },
        { id: 's1', name: 'MCF', members: ['local|z', 'local|b', 'ssh:box|a'] },
        { id: 's2', name: 'Infra', members: ['local|q'] },
        { id: 's3', name: 'Ops', members: [] }
      ]
    }
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(rect(0, 600))
    vi.spyOn(sectionTitle, 'getBoundingClientRect').mockReturnValue(rect(80, 108))
    vi.spyOn(sectionCard, 'getBoundingClientRect').mockReturnValue(rect(150, 205))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    store.dropWorkspacesIntoCustomSection.mockClear()
    store.removeWorkspaceFromCustomSection.mockClear()
  })

  it('drops the dragged copy before the next stored member below the line, never a twin', () => {
    pointAt(sectionCard)
    const ctx = makeCtx()
    expect(commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx, x: 50, y: 180 })).toBe(true)
    // `b` is the first unit under the line; it resolves to the stored local member, not its ssh twin.
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenCalledWith(
      [{ key: 'ssh:box|a', worktree: { id: 'a', hostId: 'ssh:box', isPinned: false } }],
      'custom-section:s1',
      'local|b'
    )
    expect(ctx.onPinWorktrees).not.toHaveBeenCalled()
  })

  it('puts a card dropped on a title at the top and draws the line under that title', () => {
    pointAt(sectionTitle)
    let state: WorktreeRowDragState = WORKTREE_ROW_DRAG_INITIAL_STATE
    const shown = previewCustomSectionDrop({
      drag: makeDrag('repo:r1'),
      ctx: makeCtx(),
      setWorktreeDragState: (update) => {
        state = typeof update === 'function' ? update(state) : update
      },
      setDragOverStatus: vi.fn(),
      setPinDragOver: vi.fn()
    })
    expect(shown).toBe(true)
    expect(state.dropIndicatorY).toBe(108)

    commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: 90 })
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenCalledWith(
      expect.any(Array),
      'custom-section:s1',
      'local|z'
    )
  })

  it('drops on the title of a collapsed or empty section before its first stored member', () => {
    vi.spyOn(collapsedTitle, 'getBoundingClientRect').mockReturnValue(rect(280, 308))
    pointAt(collapsedTitle)
    let state: WorktreeRowDragState = WORKTREE_ROW_DRAG_INITIAL_STATE
    expect(
      previewCustomSectionDrop({
        drag: makeDrag('repo:r1'),
        ctx: makeCtx(),
        setWorktreeDragState: (update) => {
          state = typeof update === 'function' ? update(state) : update
        },
        setDragOverStatus: vi.fn(),
        setPinDragOver: vi.fn()
      })
    ).toBe(true)
    expect(state.dropIndicatorY).toBe(308)
    commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: 290 })
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenLastCalledWith(
      expect.any(Array),
      'custom-section:s2',
      'local|q'
    )

    pointAt(emptyTitle)
    commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: 290 })
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenLastCalledWith(
      expect.any(Array),
      'custom-section:s3',
      null
    )
  })

  it('keeps folders out of sections and leaves their pin to upstream', () => {
    pointAt(sectionCard)
    commitCustomSectionDrop({
      drag: makeDrag('repo:r1', ['a', 'folder:f1']),
      ctx: makeCtx(),
      x: 50,
      y: 180
    })
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenLastCalledWith(
      [{ key: 'ssh:box|a', worktree: { id: 'a', hostId: 'ssh:box', isPinned: false } }],
      'custom-section:s1',
      'local|b'
    )

    pointAt(pinnedTitle)
    const ctx = makeCtx()
    commitCustomSectionDrop({ drag: makeDrag('repo:r1', ['a', 'folder:f1']), ctx, x: 50, y: 90 })
    expect(ctx.onPinWorktrees).toHaveBeenCalledWith(['a', 'folder:f1'])
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenLastCalledWith(
      [{ key: 'ssh:box|a' }],
      'pinned',
      'local|p'
    )
  })

  it('pins through the upstream drop on the Pinned title and ignores a status named pinned', () => {
    pointAt(pinnedTitle)
    const ctx = makeCtx()
    commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx, x: 50, y: 90 })
    expect(ctx.onPinWorktrees).toHaveBeenCalledWith(['a'])
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenCalledWith(
      [{ key: 'ssh:box|a' }],
      'pinned',
      'local|p'
    )

    store.dropWorkspacesIntoCustomSection.mockClear()
    pointAt(statusTitle)
    expect(commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx, x: 50, y: 90 })).toBe(false)
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()
  })

  it('takes only a section card right next to a gap, never a gap of a later group', () => {
    pointAt(container)
    expect(
      commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: 245 })
    ).toBe(false)
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()

    // Level with a section card but off the sidebar.
    expect(
      commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 300, y: 210 })
    ).toBe(false)

    expect(
      commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: 210 })
    ).toBe(true)
  })

  it('leaves drops to upstream inside the source section and before sections are used', () => {
    pointAt(sectionCard)
    expect(
      commitCustomSectionDrop({
        drag: makeDrag('custom-section:s1'),
        ctx: makeCtx(),
        x: 50,
        y: 180
      })
    ).toBe(false)

    store.customSidebarSections = null
    expect(
      commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: 180 })
    ).toBe(false)
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()
    expect(store.removeWorkspaceFromCustomSection).not.toHaveBeenCalled()
  })

  it('takes user-section cards dropped on the list out of the section, never pinned ones', () => {
    pointAt(repoCard)
    expect(
      commitCustomSectionDrop({
        drag: makeDrag('custom-section:s1', ['a', 'p']),
        ctx: makeCtx(),
        x: 50,
        y: 400
      })
    ).toBe(false)
    expect(store.removeWorkspaceFromCustomSection).toHaveBeenCalledTimes(1)
    expect(store.removeWorkspaceFromCustomSection).toHaveBeenCalledWith({
      key: 'ssh:box|a',
      worktree: { id: 'a', hostId: 'ssh:box', isPinned: false }
    })

    store.removeWorkspaceFromCustomSection.mockClear()
    commitCustomSectionDrop({ drag: makeDrag('pinned'), ctx: makeCtx(), x: 50, y: 400 })
    expect(store.removeWorkspaceFromCustomSection).not.toHaveBeenCalled()
  })

  it('still nests a card dropped in the middle of a section card (lineage wins)', () => {
    pointAt(sectionCard)
    const ctx = makeCtx({
      getEligibleLineageDropTarget: () => ({ status: null, isPinDrop: false, lineageParentId: 'b' })
    })
    commitWorktreePointerDrop({
      event: new PointerEvent('pointerup', { clientX: 50, clientY: 180 }),
      drag: makeDrag('repo:r1'),
      ctx,
      onWorkspaceBoardDragPreviewCommit: vi.fn(),
      onDropWorktreesOnWorkspaceBoard: vi.fn()
    })
    expect(ctx.commitWorktreeLineageParentDrop).toHaveBeenCalledWith(['a'], 'b')
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()
  })

  it('ignores a section card within a row gap when the pointer is past the sidebar edge', () => {
    // A virtualized card in overscan can sit just beyond the container, within the gap padding.
    vi.spyOn(sectionCard, 'getBoundingClientRect').mockReturnValue(rect(604, 650))
    pointAt(container)
    expect(
      commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: 602 })
    ).toBe(false)
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()
  })

  it('stores only the dragged cards, never the lineage children riding along', () => {
    pointAt(sectionCard)
    const withChild: WorktreePointerDrag['draggedCopies'] = [
      { id: 'a', hostId: 'ssh:box' },
      { id: 'child', hostId: 'local' }
    ]
    commitCustomSectionDrop({
      drag: makeDrag('repo:r1', ['a'], withChild),
      ctx: makeCtx(),
      x: 50,
      y: 180
    })
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenCalledWith(
      [{ key: 'ssh:box|a', worktree: { id: 'a', hostId: 'ssh:box', isPinned: false } }],
      'custom-section:s1',
      'local|b'
    )
  })

  it('draws no insertion line before sections are used', () => {
    store.customSidebarSections = null
    pointAt(sectionTitle)
    const setWorktreeDragState = vi.fn()
    expect(
      previewCustomSectionDrop({
        drag: makeDrag('repo:r1'),
        ctx: makeCtx(),
        setWorktreeDragState,
        setDragOverStatus: vi.fn(),
        setPinDragOver: vi.fn()
      })
    ).toBe(false)
    expect(setWorktreeDragState).not.toHaveBeenCalled()
  })

  it('takes a section card exactly 8 px from the pointer, above or below, never 9 px', () => {
    pointAt(container)
    const dropsAt = (y: number) =>
      commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y })
    // The card spans 150..205.
    expect(dropsAt(213)).toBe(true)
    expect(dropsAt(214)).toBe(false)
    expect(dropsAt(142)).toBe(true)
    expect(dropsAt(141)).toBe(false)
  })

  it('falls back to the previewed section when released within 6 px of it off any row', () => {
    pointAt(container)
    const previewAt210 = (drag: WorktreePointerDrag) => {
      drag.currentY = 210
      return previewCustomSectionDrop({
        drag,
        ctx: makeCtx(),
        setWorktreeDragState: vi.fn(),
        setDragOverStatus: vi.fn(),
        setPinDragOver: vi.fn()
      })
    }

    // 216 is past the row gap (205 + 8), so only the previewed target is left.
    const near = makeDrag('repo:r1')
    expect(previewAt210(near)).toBe(true)
    expect(commitCustomSectionDrop({ drag: near, ctx: makeCtx(), x: 50, y: 216 })).toBe(true)

    const far = makeDrag('repo:r1')
    expect(previewAt210(far)).toBe(true)
    expect(commitCustomSectionDrop({ drag: far, ctx: makeCtx(), x: 50, y: 217 })).toBe(false)
  })

  it('stores a multi-selection in drag order, a lineage child dragged on its own included', () => {
    pointAt(sectionCard)
    const copies: WorktreePointerDrag['draggedCopies'] = [
      { id: 'a', hostId: 'ssh:box' },
      { id: 'child', hostId: 'local' }
    ]
    commitCustomSectionDrop({
      drag: makeDrag('repo:r1', ['a', 'child'], copies),
      ctx: makeCtx(),
      x: 50,
      y: 180
    })
    const [stored] = store.dropWorkspacesIntoCustomSection.mock.calls[0]!
    // Sorted by key it would be local|child first; the drag order wins.
    expect(stored.map((workspace: { key: string }) => workspace.key)).toEqual([
      'ssh:box|a',
      'local|child'
    ])
  })

  it('ignores a section card past the top edge when the pointer is above the sidebar', () => {
    vi.spyOn(sectionCard, 'getBoundingClientRect').mockReturnValue(rect(-50, -4))
    pointAt(container)
    expect(
      commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx: makeCtx(), x: 50, y: -2 })
    ).toBe(false)
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()
  })

  it('takes a drop on a Pinned card for Pinned, without the status of that card', () => {
    vi.spyOn(pinnedCard, 'getBoundingClientRect').mockReturnValue(rect(300, 355))
    pointAt(pinnedCard)
    const ctx = makeCtx({
      worktreeDragUnitGroups: [
        { key: 'pinned', worktreeIds: ['p'], units: [{ worktreeId: 'p', worktreeIds: ['p'] }] }
      ],
      computeWorktreeGroupDrop: ({ groupKey }) =>
        groupKey === 'pinned'
          ? {
              dropIndex: 0,
              dropIndicatorY: 300,
              previewOffsetsByWorktreeId: new Map(),
              dropAnchorId: 'p'
            }
          : null
    })
    commitWorktreePointerDrop({
      event: new PointerEvent('pointerup', { clientX: 50, clientY: 320 }),
      drag: makeDrag('repo:r1'),
      ctx,
      onWorkspaceBoardDragPreviewCommit: vi.fn(),
      onDropWorktreesOnWorkspaceBoard: vi.fn()
    })
    expect(ctx.onPinWorktrees).toHaveBeenCalledWith(['a'])
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenCalledWith(
      [{ key: 'ssh:box|a' }],
      'pinned',
      'local|p'
    )
    expect(ctx.onMoveWorktreesToStatus).not.toHaveBeenCalled()
    expect(ctx.onMoveWorktreesToStatusAtIndex).not.toHaveBeenCalled()
  })

  it('takes a section card dropped on a list title out of its section', () => {
    pointAt(repoTitle)
    commitCustomSectionDrop({
      drag: makeDrag('custom-section:s1', ['a', 'p']),
      ctx: makeCtx(),
      x: 50,
      y: 400
    })
    expect(store.removeWorkspaceFromCustomSection).toHaveBeenCalledTimes(1)
    expect(store.removeWorkspaceFromCustomSection).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ssh:box|a' })
    )
  })

  it('takes every dragged member of any user section out when dropped on the list', () => {
    pointAt(repoCard)
    // `q` belongs to the other section; the selection started in s1.
    commitCustomSectionDrop({
      drag: makeDrag('custom-section:s1', ['a', 'q']),
      ctx: makeCtx(),
      x: 50,
      y: 400
    })
    expect(store.removeWorkspaceFromCustomSection).toHaveBeenCalledTimes(2)
    expect(store.removeWorkspaceFromCustomSection).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'ssh:box|a' })
    )
    expect(store.removeWorkspaceFromCustomSection).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'local|q' })
    )
  })

  it('anchors the drop on the shown card when the section has no drag units', () => {
    pointAt(sectionCard)
    const ctx = makeCtx({
      worktreeDragUnitGroups: [],
      computeWorktreeGroupDrop: () => ({
        dropIndex: 1,
        dropIndicatorY: 120,
        previewOffsetsByWorktreeId: new Map(),
        dropAnchorId: 'b'
      })
    })
    commitCustomSectionDrop({ drag: makeDrag('repo:r1'), ctx, x: 50, y: 180 })
    expect(store.dropWorkspacesIntoCustomSection).toHaveBeenCalledWith(
      expect.any(Array),
      'custom-section:s1',
      'local|b'
    )
  })

  it('leaves a folder-only drag to upstream on user sections but still pins it on Pinned', () => {
    const folderDrag = () => makeDrag('repo:r1', ['folder:f1'])
    let state: WorktreeRowDragState = WORKTREE_ROW_DRAG_INITIAL_STATE
    const setWorktreeDragState = vi.fn((update: React.SetStateAction<WorktreeRowDragState>) => {
      state = typeof update === 'function' ? update(state) : update
    })

    for (const target of [sectionCard, sectionTitle]) {
      pointAt(target)
      expect(
        previewCustomSectionDrop({
          drag: folderDrag(),
          ctx: makeCtx(),
          setWorktreeDragState,
          setDragOverStatus: vi.fn(),
          setPinDragOver: vi.fn()
        })
      ).toBe(false)
      expect(commitCustomSectionDrop({ drag: folderDrag(), ctx: makeCtx(), x: 50, y: 180 })).toBe(
        false
      )
    }
    expect(setWorktreeDragState).not.toHaveBeenCalled()
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()

    pointAt(pinnedTitle)
    const ctx = makeCtx()
    expect(commitCustomSectionDrop({ drag: folderDrag(), ctx, x: 50, y: 90 })).toBe(true)
    expect(ctx.onPinWorktrees).toHaveBeenCalledWith(['folder:f1'])
  })

  it('leaves a drop on the board to upstream while sections are active', () => {
    board.commitTarget = { status: 'todo', isPinDrop: false }
    pointAt(sectionCard)
    const onDropWorktreesOnWorkspaceBoard = vi.fn()
    commitWorktreePointerDrop({
      event: new PointerEvent('pointerup', { clientX: 50, clientY: 180 }),
      drag: makeDrag('repo:r1'),
      ctx: makeCtx(),
      onWorkspaceBoardDragPreviewCommit: vi.fn(),
      onDropWorktreesOnWorkspaceBoard
    })
    expect(onDropWorktreesOnWorkspaceBoard).toHaveBeenCalledTimes(1)
    expect(store.dropWorkspacesIntoCustomSection).not.toHaveBeenCalled()
  })
})
