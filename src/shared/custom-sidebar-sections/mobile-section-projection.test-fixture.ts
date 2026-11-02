/** Fork-owned (richarddaros/orca): rows, sections and catalogs the mobile section projection tests share. */
import type {
  MobileProjectSectionCatalog,
  MobileProjectSectionsResult
} from '../mobile-project-sections-contract'
import type {
  RuntimeWorktreePsResult,
  RuntimeWorktreePsSummary
} from '../runtime-worktree-contracts'
import type { CustomSidebarSectionsState } from './custom-sidebar-sections-state'

export function psRow(
  id: string,
  overrides: Partial<RuntimeWorktreePsSummary> = {}
): RuntimeWorktreePsSummary {
  return {
    worktreeId: id,
    repoId: 'repo-a',
    repo: 'orca',
    path: `/work/${id}`,
    branch: id,
    isArchived: false,
    isMainWorktree: false,
    hasHostSidebarActivity: false,
    parentWorktreeId: null,
    childWorktreeIds: [],
    displayName: id,
    workspaceStatus: 'in-progress',
    sortOrder: 0,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    linkedGitLabMR: null,
    linkedGitLabIssue: null,
    comment: '',
    isPinned: false,
    isActive: false,
    unread: false,
    liveTerminalCount: 0,
    hasAttachedPty: false,
    lastOutputAt: null,
    preview: '',
    status: 'inactive',
    agents: [],
    ...overrides
  }
}

export function psResult(...worktrees: RuntimeWorktreePsSummary[]): RuntimeWorktreePsResult {
  return { worktrees, totalCount: worktrees.length, truncated: false }
}

export function sectionsState(
  ...sections: { id: string; name: string; members: string[] }[]
): CustomSidebarSectionsState {
  return { version: 1, sections: [{ id: 'pinned', name: '', members: [] }, ...sections] }
}

export function catalogOf(...repos: [id: string, name: string][]): MobileProjectSectionsResult {
  const catalog: MobileProjectSectionCatalog = {
    repos: repos.map(([id, displayName]) => ({
      id,
      displayName,
      path: `/repos/${id}`,
      badgeColor: '#111111'
    })),
    projects: [],
    setups: [],
    projectOrderBy: 'manual'
  }
  return { catalog }
}
