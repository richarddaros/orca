/** Fork-owned (richarddaros/orca): row order inside Pinned and user sections, independent of the sort. */
import { getWorktreeHostIdentity } from '../worktree/host-qualified-identity'
import type { Worktree } from '../worktree/types'
import { compareCodePoints } from '../sidebar-list/text-order'

const identityOf = getWorktreeHostIdentity

// Why: lineage children follow their parent; creation time keeps their order independent of activity.
export function compareFollowers(left: Worktree, right: Worktree): number {
  return (
    (left.createdAt ?? 0) - (right.createdAt ?? 0) ||
    compareCodePoints(identityOf(left), identityOf(right))
  )
}

/** Each root followed by its lineage followers, as the rows show them; hidden rows are walked through. */
export function inDisplayOrder(
  roots: readonly Worktree[],
  followers: readonly Worktree[],
  childrenByParentIdentity: ReadonlyMap<string, readonly Worktree[]>
): Worktree[] {
  const unplaced = new Map(followers.map((row) => [identityOf(row), row]))
  const ordered: Worktree[] = []
  const seen = new Set<string>()
  const visit = (parent: Worktree): void => {
    for (const child of [...(childrenByParentIdentity.get(identityOf(parent)) ?? [])].sort(
      compareFollowers
    )) {
      const identity = identityOf(child)
      if (seen.has(identity)) {
        continue
      }
      seen.add(identity)
      const follower = unplaced.get(identity)
      if (follower) {
        unplaced.delete(identity)
        ordered.push(follower)
      }
      visit(child)
    }
  }
  for (const root of roots) {
    ordered.push(root)
    visit(root)
  }
  return [...ordered, ...unplaced.values()]
}

export function orderByRank(rows: readonly Worktree[], members: readonly string[]): Worktree[] {
  const rank = new Map(members.map((member, index) => [member, index]))
  const explicit = rows.filter((row) => rank.has(identityOf(row)))
  const rest = rows.filter((row) => !rank.has(identityOf(row)))
  explicit.sort(
    (left, right) => (rank.get(identityOf(left)) ?? 0) - (rank.get(identityOf(right)) ?? 0)
  )
  return [...explicit, ...rest]
}
