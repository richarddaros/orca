import { getFolderWorkspaceHostIdentity } from '../folder-workspaces/folder-workspace-worktree'
import { getTopVisibleLineageRoots } from '../sidebar-list/lineage/worktree-lineage-placement'
import {
  buildWorktreeOccurrencePlan,
  type WorktreeOccurrencePlan,
  type WorktreeOccurrenceSection
} from '../sidebar-list/lineage/worktree-occurrence-plan'
import { getWorktreeHostIdentity } from '../worktree/host-qualified-identity'
import type { Worktree } from '../worktree/types'
import {
  getRenderableFolderWorkspaces,
  type RenderableFolderWorkspace
} from '../sidebar-list/folders/folder-workspace-lanes'
import { isFolderLaneSectionKey } from '../sidebar-list/folders/folder-workspace-occurrences'
import { PINNED_GROUP_KEY } from '../sidebar-list/sections/group-keys'
import {
  getLaneHostWorktreeCounts,
  getLaneHostWorktreeIds
} from '../sidebar-list/hosts/host-labels'
import { appendWorktreeRows, buildFolderWorkspaceRow } from '../sidebar-list/sections/row-builders'
import type { Row } from '../sidebar-list/row-types'
import type { SidebarRowPlanInputs } from '../sidebar-list/sidebar-row-plan'
import type { WorktreeGroupEntry } from '../sidebar-list/sections/worktree-group-entry'
import {
  PINNED_CUSTOM_SECTION_ID,
  getCustomSectionGroupKey,
  type CustomSidebarSection
} from './custom-sidebar-sections-state'
import { compareFollowers, inDisplayOrder, orderByRank } from './custom-section-order'

type LineagePlacement = {
  pinned: Worktree[]
  natural: readonly Worktree[]
  displayRootByIdentity: ReadonlyMap<string, Worktree>
}

/** One custom section as an occurrence-plan section; the list emits it at its stored position. */
export type CustomOccurrenceSection = {
  key: string
  group: WorktreeGroupEntry
  placement: 'natural'
  items: Worktree[]
  revealPath: { key: string }
}

type OccurrenceSection = WorktreeOccurrenceSection<Worktree> & { group: WorktreeGroupEntry }
type BuildArgs<Section extends OccurrenceSection> = Parameters<
  typeof buildWorktreeOccurrencePlan<Worktree, Section>
>[0]
type BuiltPlan<Section extends OccurrenceSection> = WorktreeOccurrencePlan<Worktree> & {
  sections: readonly (Section | CustomOccurrenceSection)[]
}

export type CustomSectionPlan = {
  /** Folder workspaces filed under a user section leave their lane. */
  renderableFolders: typeof getRenderableFolderWorkspaces
  /** The upstream occurrence plan, with user sections placed around it and their rows kept for `emitSections`. */
  build: <Section extends OccurrenceSection>(args: BuildArgs<Section>) => BuiltPlan<Section>
  /** Pinned, user sections and folder lanes render outside the ordered project groups. */
  isPlacedOutsideGroups: (key: string) => boolean
  emitSections: (
    position: 'before' | 'after',
    result: Row[],
    collapsedGroups: Set<string>,
    hostContextLabelByWorktreeIdentity?: ReadonlyMap<string, string>
  ) => void
}

const NO_CUSTOM_SECTIONS: CustomSectionPlan = {
  renderableFolders: getRenderableFolderWorkspaces,
  build: (args) => buildWorktreeOccurrencePlan(args),
  isPlacedOutsideGroups: (key) => key === PINNED_GROUP_KEY || isFolderLaneSectionKey(key),
  emitSections: () => {}
}

const identityOf = getWorktreeHostIdentity

/**
 * Fork-owned (richarddaros/orca): places user sections around the upstream occurrence plan.
 * `null` state is a no-op so web, mobile and the main-process feed keep today's rows.
 */
export function createCustomSectionPlan(
  inputs: Pick<
    SidebarRowPlanInputs,
    'customSidebarSections' | 'worktrees' | 'repoMap' | 'repoOfWorktree' | 'defaultHostId'
  >
): CustomSectionPlan {
  const state = inputs.customSidebarSections
  if (!state) {
    return NO_CUSTOM_SECTIONS
  }
  const rows = inputs.worktrees
  const repoOf =
    inputs.repoOfWorktree ?? ((worktree: Worktree) => inputs.repoMap.get(worktree.repoId))
  let occurrencePlan: WorktreeOccurrencePlan<Worktree> | null = null
  const pinnedSection = state.sections.find((section) => section.id === PINNED_CUSTOM_SECTION_ID)
  const customSections = state.sections.filter((section) => section.id !== PINNED_CUSTOM_SECTION_ID)
  const sectionIdByMember = new Map<string, string>()
  for (const section of customSections) {
    for (const member of section.members) {
      sectionIdByMember.set(member, section.id)
    }
  }
  const sectionKeys = new Set(customSections.map((section) => getCustomSectionGroupKey(section.id)))
  const folderMembers = new Map<string, RenderableFolderWorkspace>()
  const itemsBySectionId = new Map<string, Worktree[]>()

  const assignCustomSections = (
    childrenByParentIdentity: ReadonlyMap<string, readonly Worktree[]>
  ): Map<string, string> => {
    const visible = new Map(rows.map((row) => [identityOf(row), row]))
    const isExplicitRoot = (row: Worktree): boolean =>
      row.isPinned === true || sectionIdByMember.has(identityOf(row))
    const assigned = new Map<string, string>()
    for (const row of rows) {
      const sectionId = sectionIdByMember.get(identityOf(row))
      if (!sectionId || row.isPinned === true) {
        continue
      }
      assigned.set(identityOf(row), sectionId)
      const seen = new Set([identityOf(row)])
      const pending = [...(childrenByParentIdentity.get(identityOf(row)) ?? [])]
      while (pending.length > 0) {
        const current = pending.pop()
        if (!current || seen.has(identityOf(current))) {
          continue
        }
        const identity = identityOf(current)
        seen.add(identity)
        const visibleRow = visible.get(identity)
        if (visibleRow && isExplicitRoot(visibleRow)) {
          continue
        }
        if (visibleRow) {
          assigned.set(identity, sectionId)
        }
        // Why: like Pinned, walk through hidden rows so a visible grandchild still follows.
        pending.push(...(childrenByParentIdentity.get(identity) ?? []))
      }
    }
    return assigned
  }

  const sectionItems = (section: CustomSidebarSection, assigned: ReadonlyMap<string, string>) => {
    const inSection = rows.filter((row) => assigned.get(identityOf(row)) === section.id)
    const memberSet = new Set(section.members)
    const followers = inSection
      .filter((row) => !memberSet.has(identityOf(row)))
      .sort(compareFollowers)
    return [
      ...orderByRank(
        inSection.filter((row) => memberSet.has(identityOf(row))),
        section.members
      ),
      ...followers
    ]
  }

  const emitCustomSection = (
    section: CustomSidebarSection,
    result: Row[],
    collapsedGroups: Set<string>,
    hostContextLabelByWorktreeIdentity?: ReadonlyMap<string, string>
  ): void => {
    const key = getCustomSectionGroupKey(section.id)
    const items = itemsBySectionId.get(section.id) ?? []
    const folders = section.members.flatMap((member) => folderMembers.get(member) ?? [])
    const hasRows = items.length > 0 || folders.length > 0
    result.push({
      type: 'header',
      key,
      label: section.name,
      count: items.length + folders.length,
      icon: { kind: 'all' },
      // Why: an empty section has no host, and a host-scoped header with no host would be dropped.
      ...(hasRows
        ? {
            hostWorktreeCounts: getLaneHostWorktreeCounts(
              items,
              folders,
              repoOf,
              inputs.defaultHostId
            ),
            hostWorktreeIds: getLaneHostWorktreeIds(items, folders, repoOf, inputs.defaultHostId)
          }
        : {}),
      worktreeIds: items.map((worktree) => worktree.id)
    })
    if (collapsedGroups.has(key)) {
      return
    }
    const worktreeRows: Row[] = []
    if (occurrencePlan) {
      appendWorktreeRows(worktreeRows, repoOf, occurrencePlan, {
        collapsedGroups,
        groupDepth: 0,
        sectionKey: key,
        hostContextLabelByWorktreeIdentity
      })
    }
    const chunks = new Map<string, Row[]>()
    let current: Row[] = []
    for (const row of worktreeRows) {
      if (row.type === 'item' && row.depth === 0) {
        current = []
        chunks.set(identityOf(row.worktree), current)
      }
      current.push(row)
    }
    for (const member of section.members) {
      const folder = folderMembers.get(member)
      if (folder) {
        result.push(buildFolderWorkspaceRow(folder, 0))
      }
      const chunk = chunks.get(member)
      if (chunk) {
        result.push(...chunk)
        chunks.delete(member)
      }
    }
    for (const chunk of chunks.values()) {
      result.push(...chunk)
    }
  }

  const withoutFolderMembers = (
    folderWorkspaces: readonly RenderableFolderWorkspace[]
  ): RenderableFolderWorkspace[] =>
    folderWorkspaces.filter((pair) => {
      const key = getFolderWorkspaceHostIdentity(pair.folderWorkspace)
      if (!sectionIdByMember.has(key)) {
        return true
      }
      folderMembers.set(key, pair)
      return false
    })

  const place = (
    placement: LineagePlacement,
    childrenByParentIdentity: ReadonlyMap<string, readonly Worktree[]>
  ) => {
    const assigned = assignCustomSections(childrenByParentIdentity)
    const pinnedRows = placement.pinned.filter((row) => !assigned.has(identityOf(row)))
    const pinned = inDisplayOrder(
      orderByRank(
        pinnedRows.filter((row) => row.isPinned === true),
        pinnedSection?.members ?? []
      ),
      pinnedRows.filter((row) => row.isPinned !== true).sort(compareFollowers),
      childrenByParentIdentity
    )
    for (const section of customSections) {
      itemsBySectionId.set(section.id, sectionItems(section, assigned))
    }
    const natural =
      assigned.size === 0
        ? placement.natural
        : placement.natural.filter((row) => !assigned.has(identityOf(row)))
    return {
      pinned,
      natural,
      displayRootByIdentity:
        assigned.size === 0
          ? placement.displayRootByIdentity
          : getTopVisibleLineageRoots(natural, childrenByParentIdentity, identityOf),
      customSections: customSections.map((section): CustomOccurrenceSection => {
        const key = getCustomSectionGroupKey(section.id)
        const items = itemsBySectionId.get(section.id) ?? []
        return {
          key,
          group: { label: section.name, items, repoIds: new Set<string>() },
          placement: 'natural',
          items,
          revealPath: { key }
        }
      })
    }
  }

  return {
    renderableFolders: (folderWorkspaces, projectGroups) =>
      withoutFolderMembers(getRenderableFolderWorkspaces(folderWorkspaces, projectGroups)),
    build: (args) => {
      const plan = buildWorktreeOccurrencePlan({
        ...args,
        sectionsOf: (placement) => {
          const placed = place(placement, args.childrenByParentIdentity)
          return [...args.sectionsOf(placed), ...placed.customSections]
        }
      })
      occurrencePlan = plan
      return plan
    },
    isPlacedOutsideGroups: (key) =>
      key === PINNED_GROUP_KEY || sectionKeys.has(key) || isFolderLaneSectionKey(key),
    emitSections: (position, result, collapsedGroups, hostContextLabelByWorktreeIdentity) => {
      const pinnedIndex = state.sections.findIndex(
        (section) => section.id === PINNED_CUSTOM_SECTION_ID
      )
      const range =
        position === 'before'
          ? state.sections.slice(0, pinnedIndex)
          : state.sections.slice(pinnedIndex + 1)
      if (position === 'after' && pinnedSection?.name) {
        const headerIndex = result.findIndex(
          (row) => row.type === 'header' && row.key === PINNED_GROUP_KEY
        )
        const header = result[headerIndex]
        if (header?.type === 'header') {
          result[headerIndex] = { ...header, label: pinnedSection.name }
        }
      }
      for (const section of range) {
        emitCustomSection(section, result, collapsedGroups, hostContextLabelByWorktreeIdentity)
      }
    }
  }
}
