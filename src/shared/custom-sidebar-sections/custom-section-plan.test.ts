import { describe, expect, it } from 'vitest'
import type { Repo } from '../repo-types'
import type { WorktreeLineage } from '../worktree/lineage-types'
import type { Worktree } from '../worktree/types'
import { getWorktreeHostIdentity } from '../worktree/host-qualified-identity'
import { planSidebarRows } from '../sidebar-list/sidebar-row-plan'
import type { Row, WorktreeGroupBy } from '../sidebar-list/row-types'
import { cloneDefaultWorkspaceStatuses } from '../workspace-statuses'
import {
  PINNED_CUSTOM_SECTION_ID,
  createInitialCustomSidebarSections,
  getCustomSectionGroupKey,
  reconcileCustomSidebarSections,
  type CustomSidebarSectionsState
} from './custom-sidebar-sections-state'

const repo: Repo = {
  id: 'repo-1',
  path: '/tmp/orca',
  displayName: 'orca',
  badgeColor: '#000000',
  addedAt: 0
}

function makeWorktree(id: string, overrides: Partial<Worktree> = {}): Worktree {
  return {
    id,
    instanceId: `${id}-instance`,
    repoId: repo.id,
    path: `/tmp/${id}`,
    branch: `refs/heads/${id}`,
    head: 'abc123',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    comment: '',
    isUnread: false,
    isPinned: false,
    displayName: id,
    sortOrder: 0,
    lastActivityAt: 0,
    ...overrides
  }
}

function makeLineage(child: Worktree, parent: Worktree): WorktreeLineage {
  return {
    worktreeId: child.id,
    worktreeInstanceId: child.instanceId!,
    parentWorktreeId: parent.id,
    parentWorktreeInstanceId: parent.instanceId!,
    origin: 'cli',
    capture: { source: 'terminal-context', confidence: 'inferred' },
    createdAt: 1
  }
}

const key = (worktree: Worktree): string => getWorktreeHostIdentity(worktree)

function rowsFor(
  worktrees: Worktree[],
  options: {
    groupBy?: WorktreeGroupBy
    sections?: CustomSidebarSectionsState | null
    lineageById?: Record<string, WorktreeLineage>
    collapsed?: string[]
  } = {}
): Row[] {
  return planSidebarRows({
    groupBy: options.groupBy ?? 'repo',
    worktrees,
    repoMap: new Map([[repo.id, repo]]),
    prGroupOf: () => 'in-progress',
    workspaceStatuses: cloneDefaultWorkspaceStatuses(),
    projectOrderBy: 'manual',
    lineageById: options.lineageById ?? {},
    worktreeMap: new Map(worktrees.map((row) => [row.id, row])),
    nestLineage: true,
    projectGroups: [],
    placeholderRepoIds: new Set(),
    importedWorktreesByRepo: new Map(),
    newExternalWorktreesInboxByRepo: new Map(),
    pendingCreations: [],
    folderWorkspaces: [],
    defaultHostId: 'local',
    pinnedDisplayPolicy: 'single-location',
    filterRepoIds: [],
    customSidebarSections: options.sections
  }).render(new Set(options.collapsed ?? []))
}

function sectionSummary(rows: Row[]): string[] {
  return rows.map((row) =>
    row.type === 'header'
      ? `# ${row.key}${row.label ? ` (${row.label})` : ''}`
      : row.type === 'item'
        ? `${'  '.repeat(row.depth)}${row.worktree.id}@${row.sectionKey}`
        : row.type
  )
}

function sections(...entries: [string, string, Worktree[]][]): CustomSidebarSectionsState {
  return {
    version: 1,
    sections: entries.map(([id, name, members]) => ({ id, name, members: members.map(key) }))
  }
}

const alpha = makeWorktree('alpha', { isPinned: true })
const beta = makeWorktree('beta', { isPinned: true })
const gamma = makeWorktree('gamma')
const delta = makeWorktree('delta')

describe('custom sidebar sections in planSidebarRows', () => {
  // Why: activation stores only Pinned, filled the way the sidebar hook reconciles it; a single lineage child keeps its place (siblings switch to creation order).
  it.each(['repo', 'none', 'workspace-status', 'pr-status'] as const)(
    'keeps %s rows as they were when sections are first activated',
    (groupBy) => {
      const child = makeWorktree('child')
      const lineageById = { [child.id]: makeLineage(child, alpha) }
      const worktrees = [gamma, alpha, child, beta, delta]
      const activated = reconcileCustomSidebarSections(
        createInitialCustomSidebarSections(),
        worktrees.map((row) => ({ key: key(row), isPinned: row.isPinned === true }))
      )
      expect(rowsFor(worktrees, { groupBy, sections: activated, lineageById })).toEqual(
        rowsFor(worktrees, { groupBy, lineageById })
      )
    }
  )

  it('keeps Pinned in the stored order whatever the incoming sort', () => {
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', [beta, alpha]])
    const pinnedOf = (rows: Row[]) =>
      sectionSummary(rows).filter((line) => line.endsWith(`@pinned`))

    expect(pinnedOf(rowsFor([alpha, beta, gamma], { sections: state }))).toEqual([
      'beta@pinned',
      'alpha@pinned'
    ])
    expect(pinnedOf(rowsFor([beta, gamma, alpha], { sections: state }))).toEqual([
      'beta@pinned',
      'alpha@pinned'
    ])
  })

  it('appends pinned rows not stored yet after the stored ones', () => {
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', [beta]])
    const rows = rowsFor([alpha, beta], { sections: state })
    expect(sectionSummary(rows).filter((line) => line.endsWith('@pinned'))).toEqual([
      'beta@pinned',
      'alpha@pinned'
    ])
  })

  it('renders sections at their stored position and keeps members out of the normal list', () => {
    const state = sections(
      ['mcf', 'MCF', [delta, gamma]],
      [PINNED_CUSTOM_SECTION_ID, 'Fixados', [alpha, beta]],
      ['empty', 'Vazia', []]
    )
    expect(sectionSummary(rowsFor([alpha, beta, gamma, delta], { sections: state }))).toEqual([
      `# ${getCustomSectionGroupKey('mcf')} (MCF)`,
      `delta@${getCustomSectionGroupKey('mcf')}`,
      `gamma@${getCustomSectionGroupKey('mcf')}`,
      '# pinned (Fixados)',
      'alpha@pinned',
      'beta@pinned',
      `# ${getCustomSectionGroupKey('empty')} (Vazia)`
    ])
  })

  it('keeps members out of every grouping mode', () => {
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', []], ['mcf', 'MCF', [gamma]])
    for (const groupBy of ['repo', 'none', 'workspace-status', 'pr-status'] as const) {
      const items = rowsFor([gamma, delta], { groupBy, sections: state }).filter(
        (row) => row.type === 'item'
      )
      expect(
        items.map((row) => row.type === 'item' && `${row.worktree.id}@${row.sectionKey}`)
      ).toContain(`gamma@${getCustomSectionGroupKey('mcf')}`)
      expect(items).toHaveLength(2)
    }
  })

  it('nests a lineage child under its member parent without making it a member', () => {
    const child = makeWorktree('child', { createdAt: 5 })
    const lineageById = { [child.id]: makeLineage(child, gamma) }
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', []], ['mcf', 'MCF', [gamma]])
    const rows = rowsFor([child, gamma, delta], { sections: state, lineageById })
    expect(sectionSummary(rows).slice(0, 3)).toEqual([
      `# ${getCustomSectionGroupKey('mcf')} (MCF)`,
      `gamma@${getCustomSectionGroupKey('mcf')}`,
      `  child@${getCustomSectionGroupKey('mcf')}`
    ])
  })

  it('keeps lineage siblings in creation order whatever the incoming sort', () => {
    const older = makeWorktree('older', { createdAt: 1 })
    const newer = makeWorktree('newer', { createdAt: 2 })
    const lineageById = {
      [older.id]: makeLineage(older, gamma),
      [newer.id]: makeLineage(newer, gamma)
    }
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', []], ['mcf', 'MCF', [gamma]])
    for (const worktrees of [
      [newer, older, gamma],
      [older, newer, gamma]
    ]) {
      expect(
        sectionSummary(rowsFor(worktrees, { sections: state, lineageById })).slice(1, 4)
      ).toEqual([
        `gamma@${getCustomSectionGroupKey('mcf')}`,
        `  older@${getCustomSectionGroupKey('mcf')}`,
        `  newer@${getCustomSectionGroupKey('mcf')}`
      ])
    }
  })

  it('moves a member that descends from a pinned row into its own section', () => {
    const child = makeWorktree('child')
    const lineageById = { [child.id]: makeLineage(child, alpha) }
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', [alpha]], ['mcf', 'MCF', [child]])
    const summary = sectionSummary(rowsFor([alpha, child], { sections: state, lineageById }))
    expect(summary).toContain(`child@${getCustomSectionGroupKey('mcf')}`)
    expect(summary).not.toContain('  child@pinned')
  })

  it('skips hidden members and keeps the remaining order', () => {
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', []], ['mcf', 'MCF', [delta, gamma, beta]])
    const rows = rowsFor([gamma, makeWorktree('beta')], { sections: state })
    expect(sectionSummary(rows).slice(0, 3)).toEqual([
      `# ${getCustomSectionGroupKey('mcf')} (MCF)`,
      `gamma@${getCustomSectionGroupKey('mcf')}`,
      `beta@${getCustomSectionGroupKey('mcf')}`
    ])
  })

  it('emits only the header of a collapsed section', () => {
    const state = sections([PINNED_CUSTOM_SECTION_ID, '', []], ['mcf', 'MCF', [gamma]])
    const rows = rowsFor([gamma, delta], {
      sections: state,
      collapsed: [getCustomSectionGroupKey('mcf')]
    })
    const header = rows.find(
      (row) => row.type === 'header' && row.key === getCustomSectionGroupKey('mcf')
    )
    expect(header?.type === 'header' && header.count).toBe(1)
    expect(sectionSummary(rows)).not.toContain(`gamma@${getCustomSectionGroupKey('mcf')}`)
  })
})
