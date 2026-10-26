import { describe, expect, it } from 'vitest'
import {
  PINNED_CUSTOM_SECTION_ID,
  addCustomSection,
  deleteCustomSection,
  getAdjacentShownMemberIndex,
  moveCustomSection,
  normalizeCustomSidebarSections,
  placeCustomSectionMember,
  reconcileCustomSidebarSections,
  renameCustomSection,
  reorderShownCustomSectionMembers,
  type CustomSidebarSectionsState
} from './custom-sidebar-sections-state'

function state(...entries: [string, string[]][]): CustomSidebarSectionsState {
  return { version: 1, sections: entries.map(([id, members]) => ({ id, name: id, members })) }
}

const membersOf = (value: CustomSidebarSectionsState) =>
  Object.fromEntries(value.sections.map((section) => [section.id, section.members]))

describe('normalizeCustomSidebarSections', () => {
  it('recovers from malformed input with exactly one Pinned', () => {
    expect(normalizeCustomSidebarSections('garbage')).toEqual({
      version: 1,
      sections: [{ id: PINNED_CUSTOM_SECTION_ID, name: '', members: [] }]
    })
  })

  it('drops duplicate sections and members shared across sections', () => {
    const normalized = normalizeCustomSidebarSections({
      sections: [
        { id: 'mcf', name: 'MCF', members: ['a', 'b', 'a', 7] },
        { id: 'mcf', name: 'again', members: ['c'] },
        { id: 'pinned', name: '', members: ['b', 'c'] },
        { name: 'no id' }
      ]
    })
    expect(normalized.sections.map((section) => section.id)).toEqual(['mcf', 'pinned'])
    expect(membersOf(normalized)).toEqual({ mcf: ['a', 'b'], pinned: ['c'] })
  })
})

describe('section edits', () => {
  it('moves a workspace between sections at the requested index', () => {
    const moved = placeCustomSectionMember(
      state(['pinned', []], ['mcf', ['a', 'b']], ['ops', ['c']]),
      'a',
      'ops',
      0
    )
    expect(membersOf(moved)).toEqual({ pinned: [], mcf: ['b'], ops: ['a', 'c'] })
  })

  it('refuses a new member in a full section instead of dropping one', () => {
    const full = state(['pinned', []], ['mcf', Array.from({ length: 500 }, (_, i) => `m${i}`)])
    expect(placeCustomSectionMember(full, 'new', 'mcf')).toBe(full)
    expect(membersOf(placeCustomSectionMember(full, 'm9', 'mcf', 0)).mcf[0]).toBe('m9')
  })

  it('creates a section holding the given workspace and removes it from the old one', () => {
    const created = addCustomSection(
      state(['pinned', []], ['mcf', ['a']]),
      { id: 'new', name: 'New' },
      'a'
    )
    expect(membersOf(created)).toEqual({ pinned: [], mcf: [], new: ['a'] })
  })

  it('never deletes Pinned and never renames a custom section to an empty name', () => {
    const initial = state(['pinned', ['a']], ['mcf', ['b']])
    expect(deleteCustomSection(initial, PINNED_CUSTOM_SECTION_ID)).toBe(initial)
    expect(renameCustomSection(initial, 'mcf', '   ')).toBe(initial)
    expect(renameCustomSection(initial, 'pinned', '').sections[0].name).toBe('')
  })

  it('moves sections within bounds only', () => {
    const initial = state(['pinned', []], ['mcf', []])
    expect(moveCustomSection(initial, 'mcf', -1).sections.map((s) => s.id)).toEqual([
      'mcf',
      'pinned'
    ])
    expect(moveCustomSection(initial, 'mcf', 1)).toBe(initial)
  })
})

describe('getAdjacentShownMemberIndex', () => {
  it('steps over hidden members and stops at the edges', () => {
    const shown = (member: string) => member !== 'archived'
    expect(getAdjacentShownMemberIndex(['a', 'archived', 'b'], 'b', -1, shown)).toBe(0)
    expect(getAdjacentShownMemberIndex(['a', 'archived', 'b'], 'a', 1, shown)).toBe(2)
    expect(getAdjacentShownMemberIndex(['archived', 'a'], 'a', -1, shown)).toBeNull()
  })
})

describe('reconcileCustomSidebarSections', () => {
  it('appends new pinned rows, drops unpinned ones and frees pinned rows from custom sections', () => {
    const initial = state(['pinned', ['a', 'b']], ['mcf', ['c', 'd']])
    const next = reconcileCustomSidebarSections(initial, [
      { key: 'a', isPinned: false },
      { key: 'b', isPinned: true },
      { key: 'c', isPinned: true },
      { key: 'e', isPinned: true }
    ])
    expect(membersOf(next)).toEqual({ pinned: ['b', 'c', 'e'], mcf: ['d'] })
  })

  it('stops storing pins once Pinned is full instead of rewriting it on every pass', () => {
    const full = state(['pinned', Array.from({ length: 500 }, (_, i) => `p${i}`)])
    const visible = [...full.sections[0].members, 'new'].map((key) => ({ key, isPinned: true }))
    expect(reconcileCustomSidebarSections(full, visible)).toBe(full)
  })

  it('leaves rows that are not visible alone and returns the same state when nothing changed', () => {
    const initial = state(['pinned', ['hidden', 'a']], ['mcf', ['archived']])
    expect(reconcileCustomSidebarSections(initial, [{ key: 'a', isPinned: true }])).toBe(initial)
  })
})

describe('reorderShownCustomSectionMembers', () => {
  it('applies the dragged order to shown members and keeps hidden ones, even a twin on another host', () => {
    const initial = state(['pinned', []], ['mcf', ['local|a', 'ssh|a', 'local|b', 'ssh|c']])
    const next = reorderShownCustomSectionMembers(initial, 'mcf', ['ssh|c', 'local|a', 'local|b'])
    expect(membersOf(next).mcf).toEqual(['ssh|c', 'ssh|a', 'local|a', 'local|b'])
  })

  it('returns the same state for an unchanged order or a row that is not a member', () => {
    const initial = state(['pinned', []], ['mcf', ['local|a', 'local|b']])
    expect(reorderShownCustomSectionMembers(initial, 'mcf', ['local|a', 'local|b'])).toBe(initial)
    expect(
      reorderShownCustomSectionMembers(initial, 'mcf', ['local|child', 'local|a', 'local|b'])
    ).toBe(initial)
  })
})
