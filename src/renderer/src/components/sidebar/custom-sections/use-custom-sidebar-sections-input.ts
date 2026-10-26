import { useEffect } from 'react'
import { useAppStore } from '@/store'
import type { CustomSidebarSectionsState } from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { getWorktreeHostIdentity } from '../../../../../shared/worktree/host-qualified-identity'
import type { Worktree } from '../../../../../shared/worktree/types'

/** Section state for row planning; keeps Pinned's frozen order in step with Pin/Unpin made anywhere. */
export function useCustomSidebarSectionsInput(
  visibleWorktrees: readonly Worktree[]
): CustomSidebarSectionsState | null {
  const sections = useAppStore((s) => s.customSidebarSections)
  const reconcile = useAppStore((s) => s.reconcileCustomSidebarSections)
  const hydrated = Boolean(sections)
  useEffect(() => {
    if (!hydrated) {
      return
    }
    reconcile(
      visibleWorktrees.map((worktree) => ({
        key: getWorktreeHostIdentity(worktree),
        isPinned: worktree.isPinned === true
      }))
    )
  }, [hydrated, reconcile, visibleWorktrees])
  return sections
}
