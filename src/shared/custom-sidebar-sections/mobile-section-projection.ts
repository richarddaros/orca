/**
 * Fork-owned (richarddaros/orca): shows the desktop's user-named sidebar sections on this host's own phone
 * without changing the phone app. The phone files rows under a repo header by `repoId` and reads the repo
 * list from `mobileRelay.projectSections`, so each section is served as a stand-in repo and its members'
 * `worktree.ps` rows name that repo. `repo.list` and every other client stay untouched. Pure: the RPC layer decides who gets it.
 */
import {
  PINNED_CUSTOM_SECTION_ID,
  getCustomSectionGroupKey,
  normalizeCustomSidebarSections,
  type CustomSidebarSection
} from '../custom-sidebar-sections/custom-sidebar-sections-state'
import { LOCAL_EXECUTION_HOST_ID } from '../execution-host'
import type {
  MobileProjectSectionRepo,
  MobileProjectSectionsResult
} from '../mobile-project-sections-contract'
import { DEFAULT_REPO_BADGE_COLOR } from '../repo-badge-color'
import type {
  RuntimeWorktreePsResult,
  RuntimeWorktreePsSummary
} from '../runtime-worktree-contracts'
import { composeWorktreeHostIdentity } from '../worktree/host-qualified-identity'

/** The stand-in repo's id; it cannot collide with a real repo id, which never starts with the group-key prefix. */
export function mobileSectionRepoId(sectionId: string): string {
  return getCustomSectionGroupKey(sectionId)
}

/** The sections a header can name: Pinned stays the phone's own, and a blank name has no header to draw. */
function namedUserSections(stored: unknown): CustomSidebarSection[] {
  if (stored === undefined || stored === null) {
    return []
  }
  return normalizeCustomSidebarSections(stored).sections.filter(
    (section) => section.id !== PINNED_CUSTOM_SECTION_ID && section.name.trim() !== ''
  )
}

/** A local row may arrive without a host while its stored key spells `local`; both name the same copy. */
function identitiesOf(worktreeId: string, hostId: RuntimeWorktreePsSummary['hostId']): string[] {
  if (hostId === undefined || hostId === LOCAL_EXECUTION_HOST_ID) {
    return [
      composeWorktreeHostIdentity(undefined, worktreeId),
      composeWorktreeHostIdentity(LOCAL_EXECUTION_HOST_ID, worktreeId)
    ]
  }
  return [composeWorktreeHostIdentity(hostId, worktreeId)]
}

type Placement = { section: CustomSidebarSection; rank: number | undefined }

/**
 * Rows the desktop shows in a user section: its non-pinned members in stored order, plus the lineage
 * children that follow a member (a child that is pinned or a member itself stays where it is).
 */
function placeRows(
  rows: readonly RuntimeWorktreePsSummary[],
  sections: readonly CustomSidebarSection[]
): Map<RuntimeWorktreePsSummary, Placement> {
  const memberPlacement = new Map<string, Placement>()
  for (const section of sections) {
    section.members.forEach((member, index) => {
      if (!memberPlacement.has(member)) {
        // Why: the phone's manual sort puts the highest rank first, so the first member needs the highest.
        memberPlacement.set(member, { section, rank: section.members.length - index })
      }
    })
  }
  const memberOf = (row: RuntimeWorktreePsSummary): Placement | undefined => {
    for (const identity of identitiesOf(row.worktreeId, row.hostId)) {
      const placement = memberPlacement.get(identity)
      if (placement) {
        return placement
      }
    }
    return undefined
  }
  const rowByIdentity = new Map<string, RuntimeWorktreePsSummary>()
  for (const row of rows) {
    for (const identity of identitiesOf(row.worktreeId, row.hostId)) {
      if (!rowByIdentity.has(identity)) {
        rowByIdentity.set(identity, row)
      }
    }
  }
  const childRowOf = (
    parent: RuntimeWorktreePsSummary,
    childId: string
  ): RuntimeWorktreePsSummary | undefined => {
    for (const identity of identitiesOf(childId, parent.hostId)) {
      const child = rowByIdentity.get(identity)
      if (child) {
        return child
      }
    }
    return undefined
  }
  const isExplicitRoot = (row: RuntimeWorktreePsSummary): boolean =>
    row.isPinned || memberOf(row) !== undefined

  const placed = new Map<RuntimeWorktreePsSummary, Placement>()
  for (const row of rows) {
    const placement = memberOf(row)
    if (!placement || row.isPinned) {
      continue
    }
    placed.set(row, placement)
    const seen = new Set<RuntimeWorktreePsSummary>([row])
    const pending = row.childWorktreeIds.map((id) => childRowOf(row, id))
    while (pending.length > 0) {
      const child = pending.pop()
      if (!child || seen.has(child)) {
        continue
      }
      seen.add(child)
      if (isExplicitRoot(child)) {
        continue
      }
      placed.set(child, { section: placement.section, rank: undefined })
      pending.push(...child.childWorktreeIds.map((id) => childRowOf(child, id)))
    }
  }
  return placed
}

/**
 * Files each section's rows under its stand-in repo. A member's `manualOrder` ranks it by stored position (first
 * member highest), so the phone's manual sort keeps the section's order; other sorts reorder as for any list.
 * Returns the same object when no row moves.
 */
export function projectCustomSectionsOntoPs<T extends RuntimeWorktreePsResult>(
  result: T,
  stored: unknown
): T {
  const sections = namedUserSections(stored)
  if (sections.length === 0) {
    return result
  }
  const placed = placeRows(result.worktrees, sections)
  if (placed.size === 0) {
    return result
  }
  const worktrees = result.worktrees.map((row) => {
    const placement = placed.get(row)
    if (!placement) {
      return row
    }
    return {
      ...row,
      repoId: mobileSectionRepoId(placement.section.id),
      repo: placement.section.name,
      ...(placement.rank !== undefined ? { manualOrder: placement.rank } : {})
    }
  })
  return { ...result, worktrees }
}

function standInRepo(section: CustomSidebarSection): MobileProjectSectionRepo {
  const id = mobileSectionRepoId(section.id)
  return {
    id,
    displayName: section.name,
    // Why: labels key on host + path, so each stand-in needs a path of its own.
    path: id,
    badgeColor: DEFAULT_REPO_BADGE_COLOR
  }
}

/**
 * Lists a stand-in repo per section ahead of the real ones, in stored order, so each shows as a header even
 * while empty. The catalog's projects and setups are untouched: a stand-in has no setup, so the phone groups
 * it by repo, which is how its rows arrive.
 */
export function projectCustomSectionsOntoCatalog(
  result: MobileProjectSectionsResult,
  stored: unknown
): MobileProjectSectionsResult {
  const sections = namedUserSections(stored)
  if (!result.catalog || sections.length === 0) {
    return result
  }
  return {
    catalog: { ...result.catalog, repos: [...sections.map(standInRepo), ...result.catalog.repos] }
  }
}
