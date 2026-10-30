import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CustomSidebarSectionsState } from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { reorderCustomSectionByDrag } from './custom-section-drag-reorder'

// Fork (richarddaros/orca): a drag inside Pinned or a user section reorders that section.
const store = vi.hoisted(() => {
  const state: {
    customSidebarSections: CustomSidebarSectionsState | null
    reorderCustomSectionByDrag: ReturnType<typeof vi.fn>
  } = { customSidebarSections: null, reorderCustomSectionByDrag: vi.fn(() => true) }
  return state
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => store } }))

// Drag groups key their members by host identity, so a twin on another host is its own card.
const groups = [
  { key: 'custom-section:s1', worktreeIds: ['local|a', 'ssh:box|a', 'local|b'] },
  { key: 'repo:r1', worktreeIds: ['local|c'] }
]

describe('reorderCustomSectionByDrag', () => {
  beforeEach(() => {
    store.reorderCustomSectionByDrag.mockClear()
    store.customSidebarSections = {
      version: 1,
      sections: [{ id: 's1', name: 'MCF', members: ['local|a', 'ssh:box|a', 'local|b'] }]
    }
  })

  it('moves only the dragged copy and leaves its same-id twin in place', () => {
    expect(
      reorderCustomSectionByDrag({
        groups,
        sourceGroupKey: 'custom-section:s1',
        draggedKeys: ['ssh:box|a'],
        dropIndex: 0
      })
    ).toBe(true)
    expect(store.reorderCustomSectionByDrag).toHaveBeenCalledWith('custom-section:s1', [
      'ssh:box|a',
      'local|a',
      'local|b'
    ])
  })

  it('leaves the drag to upstream before the sections are first used', () => {
    store.customSidebarSections = null
    expect(
      reorderCustomSectionByDrag({
        groups,
        sourceGroupKey: 'custom-section:s1',
        draggedKeys: ['local|b'],
        dropIndex: 0
      })
    ).toBe(false)
    expect(store.reorderCustomSectionByDrag).not.toHaveBeenCalled()
  })

  it('leaves a drag inside a regular group to upstream', () => {
    expect(
      reorderCustomSectionByDrag({
        groups,
        sourceGroupKey: 'repo:r1',
        draggedKeys: ['local|c'],
        dropIndex: 0
      })
    ).toBe(false)
    expect(store.reorderCustomSectionByDrag).not.toHaveBeenCalled()
  })
})
