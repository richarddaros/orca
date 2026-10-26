import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getWorktreeHostIdentity } from '../../../../shared/worktree/host-qualified-identity'
import { PINNED_GROUP_KEY } from '../../../../shared/sidebar-list/group-keys'
import { getCustomSectionGroupKey } from '../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { createTestStore, makeWorktree } from './store-test-helpers'

const uiSet = vi.fn<(updates: Record<string, unknown>) => Promise<void>>()
const uiGet = vi.fn<() => Promise<Record<string, unknown>>>()

beforeEach(() => {
  uiSet.mockReset().mockResolvedValue(undefined)
  uiGet.mockReset().mockResolvedValue({})
  vi.stubGlobal('window', { api: { ui: { set: uiSet, get: uiGet } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function hydratedStore() {
  const store = createTestStore()
  const setPinned = vi.fn()
  store.setState({ setWorktreesPinnedAndReveal: setPinned })
  store.getState().hydrateCustomSidebarSections(undefined, 'startup')
  return { store, setPinned }
}

const pinnedWorktree = makeWorktree({ id: 'wt-pinned', repoId: 'repo', isPinned: true })
const pinnedWorkspace = { key: getWorktreeHostIdentity(pinnedWorktree), worktree: pinnedWorktree }
const sectionIds = (store: ReturnType<typeof createTestStore>) =>
  store.getState().customSidebarSections?.sections.map((section) => section.id)

describe('custom sidebar sections slice', () => {
  it('stays inactive and writes nothing while sections were never used', () => {
    const { store } = hydratedStore()
    store.getState().reconcileCustomSidebarSections([{ key: pinnedWorkspace.key, isPinned: true }])

    expect(store.getState().customSidebarSections).toBeNull()
    expect(store.getState().reorderCustomSectionByDrag(PINNED_GROUP_KEY, ['wt-pinned'])).toBe(false)
    expect(uiSet).not.toHaveBeenCalled()
  })

  it('reads saved sections from disk before the first write, and writes nothing if that read fails', async () => {
    const { store } = hydratedStore()
    uiGet.mockResolvedValueOnce({
      customSidebarSections: { version: 1, sections: [{ id: 'old', name: 'Old', members: [] }] }
    })
    const id = await store.getState().createCustomSection('MCF')
    expect(sectionIds(store)).toEqual(['pinned', 'old', id])
    expect(uiSet).toHaveBeenCalledWith({
      customSidebarSections: store.getState().customSidebarSections
    })

    const degraded = hydratedStore().store
    uiGet.mockRejectedValueOnce(new Error('ui.get failed'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    uiSet.mockClear()
    expect(await degraded.getState().createCustomSection('MCF')).toBeNull()
    expect(uiSet).not.toHaveBeenCalled()
  })

  it('unpins a workspace through the shared Pin action when it moves to a user section', async () => {
    const { store, setPinned } = hydratedStore()
    const id = await store.getState().createCustomSection('MCF', pinnedWorkspace)

    expect(setPinned).toHaveBeenCalledWith([pinnedWorktree], false)
    expect(store.getState().customSidebarSections?.sections.find((s) => s.id === id)).toEqual({
      id,
      name: 'MCF',
      members: [pinnedWorkspace.key]
    })
  })

  it('pins a workspace moved into Pinned, never deletes Pinned and keeps the pin when a section is full', async () => {
    const { store, setPinned } = hydratedStore()
    const unpinned = { ...pinnedWorktree, isPinned: false }
    await store
      .getState()
      .moveWorkspaceToCustomSection({ key: pinnedWorkspace.key, worktree: unpinned }, 'pinned')
    expect(setPinned).toHaveBeenCalledWith([unpinned], true)
    // The new pin joins after the pins already shown, via reconcile.
    store.getState().reconcileCustomSidebarSections([
      { key: pinnedWorkspace.key, isPinned: true },
      { key: 'local|shown-first', isPinned: true }
    ])
    expect(store.getState().customSidebarSections?.sections[0].members).toEqual([
      pinnedWorkspace.key,
      'local|shown-first'
    ])

    uiSet.mockClear()
    await store.getState().deleteCustomSection('pinned')
    expect(uiSet).not.toHaveBeenCalled()

    const members = Array.from({ length: 500 }, (_, index) => `local|m${index}`)
    store.setState({
      customSidebarSections: {
        version: 1,
        sections: [
          { id: 'pinned', name: '', members: [] },
          { id: 'full', name: 'Full', members }
        ]
      }
    })
    setPinned.mockClear()
    await store.getState().moveWorkspaceToCustomSection(pinnedWorkspace, 'full')
    expect(setPinned).not.toHaveBeenCalled()
  })

  it('takes over drags inside an active section and leaves other groups to the manual sort', async () => {
    const { store } = hydratedStore()
    const id = (await store.getState().createCustomSection('MCF'))!
    await store.getState().moveWorkspaceToCustomSection({ key: 'local|a' }, id)
    await store.getState().moveWorkspaceToCustomSection({ key: 'local|b' }, id)

    expect(
      store
        .getState()
        .reorderCustomSectionByDrag(getCustomSectionGroupKey(id), ['local|b', 'local|a'])
    ).toBe(true)
    expect(store.getState().customSidebarSections?.sections.at(-1)?.members).toEqual([
      'local|b',
      'local|a'
    ])
    expect(store.getState().reorderCustomSectionByDrag('repo:repo', ['local|a'])).toBe(false)
  })

  it('ignores a sync echo while a newer local write is in flight', async () => {
    const { store } = hydratedStore()
    const id = (await store.getState().createCustomSection('MCF'))!
    await Promise.resolve()
    const staleEcho = store.getState().customSidebarSections

    let finishWrite: () => void = () => {}
    uiSet.mockReturnValueOnce(new Promise<void>((resolve) => (finishWrite = resolve)))
    await store.getState().renameCustomSection(id, 'Operações')
    store.getState().hydrateCustomSidebarSections(staleEcho, 'sync')
    expect(store.getState().customSidebarSections?.sections.at(-1)?.name).toBe('Operações')

    finishWrite()
    await vi.waitFor(() => {
      store.getState().hydrateCustomSidebarSections(staleEcho, 'sync')
      expect(store.getState().customSidebarSections?.sections.at(-1)?.name).toBe('MCF')
    })
  })

  it('stays inactive on the paired web client', async () => {
    vi.stubGlobal('__ORCA_WEB_CLIENT__', true)
    const store = createTestStore()
    store.getState().hydrateCustomSidebarSections({ version: 1, sections: [] }, 'startup')
    expect(store.getState().customSidebarSections).toBeNull()
    expect(await store.getState().createCustomSection('MCF')).toBeNull()
    expect(uiGet).not.toHaveBeenCalled()
  })
})
