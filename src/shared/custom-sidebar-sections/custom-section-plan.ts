import { getFolderWorkspaceHostIdentity } from '../folder-workspace-worktree'
import { getTopVisibleLineageRoots } from '../worktree-lineage-placement'
import type { WorktreeOccurrencePlan } from '../worktree-occurrence-plan'
import { getWorktreeHostIdentity } from '../worktree/host-qualified-identity'
import type { Worktree } from '../worktree/types'
import type { RenderableFolderWorkspace } from '../sidebar-list/folder-workspace-lanes'
import { PINNED_GROUP_KEY } from '../sidebar-list/group-keys'
import { getLaneHostWorktreeCounts, getLaneHostWorktreeIds } from '../sidebar-list/host-labels'
import { appendWorktreeRows, buildFolderWorkspaceRow } from '../sidebar-list/row-builders'
import type { Row } from '../sidebar-list/row-types'
import type { SidebarRowPlanInputs } from '../sidebar-list/sidebar-row-plan'
import type { WorktreeGroupEntry } from '../sidebar-list/worktree-group-entry'
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

export type CustomSectionPlan = {
  withoutFolderMembers: (
    folderWorkspaces: readonly RenderableFolderWorkspace[]
  ) => RenderableFolderWorkspace[]
  place: (placement: LineagePlacement) => LineagePlacement & {
    customSections: CustomOccurrenceSection[]
  }
  /** Pinned and user sections render outside the grouped lanes. */
  isPlacedOutsideGroups: (key: string) => boolean
  /** Rows come from the finished occurrence plan, which only exists after `place` ran. */
  attach: (occurrencePlan: WorktreeOccurrencePlan<Worktree>) => void
  emitSections: (
    position: 'before' | 'after',
    result: Row[],
    collapsedGroups: Set<string>,
    hostContextLabelByWorktreeIdentity?: ReadonlyMap<string, string>
  ) => void
}

const NO_CUSTOM_SECTIONS: CustomSectionPlan = {
  withoutFolderMembers: (folderWorkspaces) => [...folderWorkspaces],
  place: (placement) => ({ ...placement, customSections: [] }),
  isPlacedOutsideGroups: (key) => key === PINNED_GROUP_KEY,
  attach: () => {},
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
  >,
  childrenByParentIdentity: ReadonlyMap<string, readonly Worktree[]>
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

  const assignCustomSections = (): Map<string, string> => {
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

  return {
    withoutFolderMembers: (folderWorkspaces) =>
      folderWorkspaces.filter((pair) => {
        const key = getFolderWorkspaceHostIdentity(pair.folderWorkspace)
        if (!sectionIdByMember.has(key)) {
          return true
        }
        folderMembers.set(key, pair)
        return false
      }),
    place: (placement) => {
      const assigned = assignCustomSections()
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
        customSections: customSections.map((section) => {
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
    },
    isPlacedOutsideGroups: (key) => key === PINNED_GROUP_KEY || sectionKeys.has(key),
    attach: (plan) => {
      occurrencePlan = plan
    },
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
