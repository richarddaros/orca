import { describe, expect, it } from 'vitest'
import { NO_WORKSPACE_ROW_FILTERS } from '../../../src/shared/workspace-view/workspace-row-filters'
import type { CustomSidebarSectionsState } from '../../../src/shared/custom-sidebar-sections/custom-sidebar-sections-state'
import {
  projectCustomSectionsOntoCatalog,
  projectCustomSectionsOntoPs
} from '../../../src/shared/custom-sidebar-sections/mobile-section-projection'
import {
  catalogOf,
  psResult,
  psRow,
  sectionsState
} from '../../../src/shared/custom-sidebar-sections/mobile-section-projection.test-fixture'
import type { MobileProjectSectionsResult } from '../../../src/shared/mobile-project-sections-contract'
import { ProjectSectionCatalogSchema } from '../../../src/shared/project-section-catalog-schema'
import type {
  RuntimeWorktreePsResult,
  RuntimeWorktreePsSummary
} from '../../../src/shared/runtime-worktree-contracts'
import { buildProjectSectionCatalog } from './project-section-catalog'
import { buildSections, type Worktree as PhoneWorktree } from './workspace-list-sections'

// Fork: what the unchanged phone app builds from the two replies this host sends its own phone.
describe('custom sections on the phone list', () => {
  function toPhone(row: RuntimeWorktreePsSummary): PhoneWorktree {
    return {
      worktreeId: row.worktreeId,
      repoId: row.repoId,
      ...(row.hostId ? { hostId: row.hostId } : {}),
      repo: row.repo,
      branch: row.branch,
      displayName: row.displayName,
      path: row.path,
      isPinned: row.isPinned,
      liveTerminalCount: 0,
      hasAttachedPty: false,
      unread: false,
      linkedPR: null,
      status: 'inactive',
      agents: [],
      sortOrder: row.sortOrder,
      ...(row.manualOrder !== undefined ? { manualOrder: row.manualOrder } : {}),
      parentWorktreeId: row.parentWorktreeId,
      childWorktreeIds: row.childWorktreeIds
    }
  }

  function phoneSections(
    result: RuntimeWorktreePsResult,
    base: MobileProjectSectionsResult,
    state: CustomSidebarSectionsState
  ) {
    const catalog = projectCustomSectionsOntoCatalog(base, state).catalog
    const served = ProjectSectionCatalogSchema.parse(JSON.parse(JSON.stringify(catalog)))
    const rows = projectCustomSectionsOntoPs(result, state).worktrees.map(toPhone)
    return buildSections(
      rows,
      'manual',
      { ...NO_WORKSPACE_ROW_FILTERS },
      '',
      'repo',
      new Set(),
      buildProjectSectionCatalog(served, [], null, 'manual')
    )
  }

  it('shows each section as a header with its members in the order the user chose', () => {
    const sections = phoneSections(
      psResult(
        psRow('a', { sortOrder: 1 }),
        psRow('b', { sortOrder: 2 }),
        psRow('c', { sortOrder: 3 }),
        psRow('d', { sortOrder: 4, isPinned: true })
      ),
      catalogOf(['repo-a', 'orca']),
      sectionsState({ id: 's1', name: 'MCF', members: ['|c', '|a'] })
    )

    expect(
      sections.map((section) => [section.title, section.data.map((row) => row.worktreeId)])
    ).toEqual([
      ['Pinned', ['d']],
      ['MCF', ['c', 'a']],
      ['orca', ['b']]
    ])
  })

  it('shows an empty section, and a child under its parent inside a section', () => {
    const sections = phoneSections(
      psResult(
        psRow('parent', { childWorktreeIds: ['kid'] }),
        psRow('kid', { parentWorktreeId: 'parent' })
      ),
      catalogOf(['repo-a', 'orca']),
      sectionsState(
        { id: 's1', name: 'MCF', members: ['|parent'] },
        { id: 's2', name: 'Later', members: [] }
      )
    )

    expect(
      sections.map((section) => [section.title, section.data.map((row) => row.worktreeId)])
    ).toEqual([
      ['MCF', ['parent', 'kid']],
      ['Later', []],
      // Why: the phone lists a repo without rows as an empty header, as the desktop does.
      ['orca', []]
    ])
  })

  it('lists the workspaces as before when no section holds one', () => {
    const sections = phoneSections(
      psResult(psRow('a'), psRow('b')),
      catalogOf(['repo-a', 'orca']),
      sectionsState({ id: 's1', name: 'MCF', members: [] })
    )

    expect(sections.map((section) => [section.title, section.data.length])).toEqual([
      ['MCF', 0],
      ['orca', 2]
    ])
  })
})
