/** Fork-owned (richarddaros/orca): user-named sidebar sections with a frozen, user-defined order. */
import type { PersistedUIState } from '../persisted-ui-state-types'

// Why: sections name this desktop's workspaces; paired clients keep their own (empty) view.
export const FORK_LOCAL_UI_FIELDS = [
  'customSidebarSections'
] as const satisfies readonly (keyof PersistedUIState)[]

export const PINNED_CUSTOM_SECTION_ID = 'pinned'

const CUSTOM_SECTION_KEY_PREFIX = 'custom-section:'
const MAX_SECTIONS = 50
const MAX_MEMBERS_PER_SECTION = 500
export const MAX_CUSTOM_SECTION_NAME_LENGTH = 60

/**
 * Members are host-qualified workspace keys (`getWorktreeHostIdentity` / `getFolderWorkspaceHostIdentity`).
 * For Pinned, membership comes from `isPinned`; `members` only freezes its order.
 * An empty Pinned name means the client's default label.
 */
export type CustomSidebarSection = {
  id: string
  name: string
  members: string[]
}

/** Display order of sections; exactly one entry is Pinned. */
export type CustomSidebarSectionsState = {
  version: 1
  sections: CustomSidebarSection[]
}

export function getCustomSectionGroupKey(sectionId: string): string {
  return `${CUSTOM_SECTION_KEY_PREFIX}${sectionId}`
}

export function getCustomSectionIdFromGroupKey(key: string): string | null {
  return key.startsWith(CUSTOM_SECTION_KEY_PREFIX)
    ? key.slice(CUSTOM_SECTION_KEY_PREFIX.length)
    : null
}

export function createInitialCustomSidebarSections(): CustomSidebarSectionsState {
  return { version: 1, sections: [{ id: PINNED_CUSTOM_SECTION_ID, name: '', members: [] }] }
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Accepts anything persisted; never throws, always returns exactly one Pinned and no duplicate members. */
export function normalizeCustomSidebarSections(value: unknown): CustomSidebarSectionsState {
  const rawSections =
    value !== null &&
    typeof value === 'object' &&
    'sections' in value &&
    Array.isArray(value.sections)
      ? value.sections
      : []
  const seenSectionIds = new Set<string>()
  const seenMembers = new Set<string>()
  const sections: CustomSidebarSection[] = []
  for (const raw of rawSections.slice(0, MAX_SECTIONS)) {
    if (raw === null || typeof raw !== 'object') {
      continue
    }
    const id = 'id' in raw ? readString(raw.id) : null
    if (!id || seenSectionIds.has(id)) {
      continue
    }
    seenSectionIds.add(id)
    const name = ('name' in raw ? readString(raw.name) : null) ?? ''
    const rawMembers = 'members' in raw && Array.isArray(raw.members) ? raw.members : []
    const members: string[] = []
    for (const member of rawMembers) {
      if (typeof member === 'string' && member.length > 0 && !seenMembers.has(member)) {
        seenMembers.add(member)
        members.push(member)
      }
    }
    sections.push({
      id,
      name: name.slice(0, MAX_CUSTOM_SECTION_NAME_LENGTH),
      members: members.slice(0, MAX_MEMBERS_PER_SECTION)
    })
  }
  if (!seenSectionIds.has(PINNED_CUSTOM_SECTION_ID)) {
    sections.unshift({ id: PINNED_CUSTOM_SECTION_ID, name: '', members: [] })
  }
  return { version: 1, sections }
}

function withoutMember(
  sections: readonly CustomSidebarSection[],
  key: string
): CustomSidebarSection[] {
  return sections.map((section) =>
    section.members.includes(key)
      ? { ...section, members: section.members.filter((member) => member !== key) }
      : section
  )
}

export function addCustomSection(
  state: CustomSidebarSectionsState,
  section: { id: string; name: string },
  firstMember?: string
): CustomSidebarSectionsState {
  if (state.sections.length >= MAX_SECTIONS || state.sections.some((s) => s.id === section.id)) {
    return state
  }
  const sections = firstMember ? withoutMember(state.sections, firstMember) : state.sections
  return {
    ...state,
    sections: [
      ...sections,
      {
        id: section.id,
        name: section.name.slice(0, MAX_CUSTOM_SECTION_NAME_LENGTH),
        members: firstMember ? [firstMember] : []
      }
    ]
  }
}

export function renameCustomSection(
  state: CustomSidebarSectionsState,
  sectionId: string,
  name: string
): CustomSidebarSectionsState {
  const trimmed = name.trim().slice(0, MAX_CUSTOM_SECTION_NAME_LENGTH)
  // Why: only Pinned may fall back to its default label; a custom section always needs a name.
  if (!trimmed && sectionId !== PINNED_CUSTOM_SECTION_ID) {
    return state
  }
  return {
    ...state,
    sections: state.sections.map((section) =>
      section.id === sectionId ? { ...section, name: trimmed } : section
    )
  }
}

export function moveCustomSection(
  state: CustomSidebarSectionsState,
  sectionId: string,
  delta: -1 | 1
): CustomSidebarSectionsState {
  const from = state.sections.findIndex((section) => section.id === sectionId)
  const to = from + delta
  if (from === -1 || to < 0 || to >= state.sections.length) {
    return state
  }
  const sections = [...state.sections]
  const [moved] = sections.splice(from, 1)
  sections.splice(to, 0, moved)
  return { ...state, sections }
}

/** Pinned cannot be deleted: Pin/Unpin still route workspaces to it. */
export function deleteCustomSection(
  state: CustomSidebarSectionsState,
  sectionId: string
): CustomSidebarSectionsState {
  if (sectionId === PINNED_CUSTOM_SECTION_ID) {
    return state
  }
  return { ...state, sections: state.sections.filter((section) => section.id !== sectionId) }
}

/**
 * Places one workspace in a section at `index` (clamped), removing it from any other section.
 * Returns `state` itself when the section is missing or full, so callers can skip Pin/Unpin.
 */
export function placeCustomSectionMember(
  state: CustomSidebarSectionsState,
  key: string,
  sectionId: string,
  index?: number
): CustomSidebarSectionsState {
  const target = state.sections.find((section) => section.id === sectionId)
  if (
    !target ||
    (target.members.length >= MAX_MEMBERS_PER_SECTION && !target.members.includes(key))
  ) {
    return state
  }
  const sections = withoutMember(state.sections, key).map((section) => {
    if (section.id !== sectionId) {
      return section
    }
    const members = [...section.members]
    const at = Math.max(0, Math.min(index ?? members.length, members.length))
    members.splice(at, 0, key)
    return { ...section, members }
  })
  return { ...state, sections }
}

/** Applies a drag's new on-screen order (host-qualified keys) to a section; hidden members keep their slots. */
export function reorderShownCustomSectionMembers(
  state: CustomSidebarSectionsState,
  sectionId: string,
  shownKeys: readonly string[]
): CustomSidebarSectionsState {
  const section = state.sections.find((candidate) => candidate.id === sectionId)
  if (!section) {
    return state
  }
  const memberSet = new Set(section.members)
  const ordered = shownKeys.filter((key) => memberSet.has(key))
  const shown = new Set(ordered)
  let slot = 0
  const members = section.members.map((member) => (shown.has(member) ? ordered[slot++] : member))
  if (members.every((member, index) => member === section.members[index])) {
    return state
  }
  return {
    ...state,
    sections: state.sections.map((candidate) =>
      candidate.id === sectionId ? { ...candidate, members } : candidate
    )
  }
}

/** Stored index one shown neighbour away, skipping hidden members, or null at the edge. */
export function getAdjacentShownMemberIndex(
  members: readonly string[],
  key: string,
  direction: -1 | 1,
  isShown: (member: string) => boolean
): number | null {
  for (
    let index = members.indexOf(key) + direction;
    index >= 0 && index < members.length;
    index += direction
  ) {
    if (isShown(members[index])) {
      return index
    }
  }
  return null
}

export function removeCustomSectionMember(
  state: CustomSidebarSectionsState,
  key: string
): CustomSidebarSectionsState {
  return state.sections.some((section) => section.members.includes(key))
    ? { ...state, sections: withoutMember(state.sections, key) }
    : state
}

/**
 * Syncs stored membership with what the list shows; returns `state` itself when nothing changed.
 * Rows that are not visible are left alone so archived or filtered members come back in place.
 */
export function reconcileCustomSidebarSections(
  state: CustomSidebarSectionsState,
  visible: readonly { key: string; isPinned: boolean }[]
): CustomSidebarSectionsState {
  const pinnedKeys = new Set(visible.filter((row) => row.isPinned).map((row) => row.key))
  const unpinnedKeys = new Set(visible.filter((row) => !row.isPinned).map((row) => row.key))
  let changed = false
  const sections = state.sections.map((section) => {
    if (section.id === PINNED_CUSTOM_SECTION_ID) {
      const kept = section.members.filter((member) => !unpinnedKeys.has(member))
      const known = new Set(kept)
      // Why: a full Pinned stores no more; unstored pins still render after it, and nothing is rewritten each tick.
      const added = [...pinnedKeys]
        .filter((key) => !known.has(key))
        .slice(0, Math.max(0, MAX_MEMBERS_PER_SECTION - kept.length))
      if (kept.length === section.members.length && added.length === 0) {
        return section
      }
      changed = true
      return { ...section, members: [...kept, ...added] }
    }
    // Why: isPinned is shared with web and mobile, so a pinned workspace belongs to Pinned only.
    if (!section.members.some((member) => pinnedKeys.has(member))) {
      return section
    }
    changed = true
    return { ...section, members: section.members.filter((member) => !pinnedKeys.has(member)) }
  })
  return changed ? { ...state, sections } : state
}
