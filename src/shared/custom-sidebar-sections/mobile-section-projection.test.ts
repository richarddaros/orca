import { describe, expect, it } from 'vitest'
import type { MobileProjectSectionsResult } from '../mobile-project-sections-contract'
import type { RuntimeWorktreePsResult } from '../runtime-worktree-contracts'
import { ProjectSectionCatalogSchema } from '../project-section-catalog-schema'
import {
  hasNamedCustomSections,
  mobileSectionRepoId,
  projectCustomSectionsOntoCatalog,
  projectCustomSectionsOntoPs
} from './mobile-section-projection'
import { catalogOf, psResult, psRow, sectionsState } from './mobile-section-projection.test-fixture'

const rowIds = (result: RuntimeWorktreePsResult) =>
  Object.fromEntries(result.worktrees.map((row) => [row.worktreeId, row.repoId]))

describe('projectCustomSectionsOntoPs', () => {
  it('files a member under its section stand-in repo and keeps its stored position', () => {
    const result = psResult(psRow('a'), psRow('b'), psRow('c'))
    const projected = projectCustomSectionsOntoPs(
      result,
      sectionsState({ id: 's1', name: 'MCF', members: ['|c', '|a'] })
    )

    expect(rowIds(projected)).toEqual({
      a: mobileSectionRepoId('s1'),
      b: 'repo-a',
      c: mobileSectionRepoId('s1')
    })
    const [a, b, c] = projected.worktrees
    // Why: the phone's manual sort puts the highest rank first, so the first stored member ranks highest.
    expect([a?.repo, a?.manualOrder, c?.manualOrder]).toEqual(['MCF', 1, 2])
    expect(b).toBe(result.worktrees[1])
  })

  it('matches a local row to a member spelled with or without the local host', () => {
    const projected = projectCustomSectionsOntoPs(
      psResult(psRow('a'), psRow('b', { hostId: 'local' })),
      sectionsState({ id: 's1', name: 'MCF', members: ['local|a', '|b'] })
    )

    expect(Object.values(rowIds(projected))).toEqual([
      mobileSectionRepoId('s1'),
      mobileSectionRepoId('s1')
    ])
  })

  it('leaves the same-id copy on another host where it was', () => {
    const projected = projectCustomSectionsOntoPs(
      psResult(psRow('a', { hostId: 'ssh:builder' }), psRow('a')),
      sectionsState({ id: 's1', name: 'MCF', members: ['ssh:builder|a'] })
    )

    expect(projected.worktrees.map((row) => row.repoId)).toEqual([
      mobileSectionRepoId('s1'),
      'repo-a'
    ])
  })

  it('keeps a pinned member in Pinned, as the desktop does', () => {
    const result = psResult(psRow('a', { isPinned: true }), psRow('b'))
    const projected = projectCustomSectionsOntoPs(
      result,
      sectionsState({ id: 's1', name: 'MCF', members: ['|a', '|b'] })
    )

    expect(projected.worktrees[0]).toBe(result.worktrees[0])
    expect(projected.worktrees[1]?.repoId).toBe(mobileSectionRepoId('s1'))
  })

  it('moves a lineage child with its parent unless the child is pinned or a member itself', () => {
    const result = psResult(
      psRow('parent', { childWorktreeIds: ['kid', 'pinned-kid', 'member-kid'] }),
      psRow('kid', { parentWorktreeId: 'parent', childWorktreeIds: ['grandkid'] }),
      psRow('grandkid', { parentWorktreeId: 'kid' }),
      psRow('pinned-kid', { parentWorktreeId: 'parent', isPinned: true }),
      psRow('member-kid', { parentWorktreeId: 'parent' }),
      psRow('outsider')
    )
    const projected = projectCustomSectionsOntoPs(
      result,
      sectionsState(
        { id: 's1', name: 'MCF', members: ['|parent'] },
        { id: 's2', name: 'Other', members: ['|member-kid'] }
      )
    )

    expect(rowIds(projected)).toEqual({
      parent: mobileSectionRepoId('s1'),
      kid: mobileSectionRepoId('s1'),
      grandkid: mobileSectionRepoId('s1'),
      'pinned-kid': 'repo-a',
      'member-kid': mobileSectionRepoId('s2'),
      outsider: 'repo-a'
    })
    // Why: a follower sits after its parent by lineage, so only members carry a stored position.
    expect(projected.worktrees.find((row) => row.worktreeId === 'kid')?.manualOrder).toBeUndefined()
  })

  it.each([
    ['no stored sections', undefined],
    ['null', null],
    ['only Pinned', sectionsState()],
    ['only a blank-named section', sectionsState({ id: 's1', name: '  ', members: ['|a'] })],
    [
      'a section with no member on this host',
      sectionsState({ id: 's1', name: 'MCF', members: ['|zzz'] })
    ],
    ['a malformed value', { version: 'x' }]
  ])('returns the same result for %s', (_label, stored) => {
    const result = psResult(psRow('a'))
    expect(projectCustomSectionsOntoPs(result, stored)).toBe(result)
  })

  it('never changes anything but repoId, repo and manualOrder', () => {
    const row = psRow('a', { branch: 'feat/x', isActive: true, comment: 'c' })
    const [projected] = projectCustomSectionsOntoPs(
      psResult(row),
      sectionsState({ id: 's1', name: 'MCF', members: ['|a'] })
    ).worktrees

    expect(projected).toEqual({
      ...row,
      repoId: mobileSectionRepoId('s1'),
      repo: 'MCF',
      manualOrder: 1
    })
  })
})

describe('projectCustomSectionsOntoCatalog', () => {
  it('lists a stand-in repo per named section ahead of the real repos, in stored order', () => {
    const projected = projectCustomSectionsOntoCatalog(
      catalogOf(['repo-a', 'orca']),
      sectionsState(
        { id: 's1', name: 'MCF', members: [] },
        { id: 's2', name: 'Docs', members: ['|a'] },
        { id: 's3', name: ' ', members: [] }
      )
    )

    expect(projected.catalog?.repos.map((repo) => [repo.id, repo.displayName])).toEqual([
      [mobileSectionRepoId('s1'), 'MCF'],
      [mobileSectionRepoId('s2'), 'Docs'],
      ['repo-a', 'orca']
    ])
    expect(new Set(projected.catalog?.repos.map((repo) => repo.path)).size).toBe(3)
  })

  it('serves what the phone parses and leaves projects, setups and order alone', () => {
    const base = catalogOf(['repo-a', 'orca'])
    const projected = projectCustomSectionsOntoCatalog(
      base,
      sectionsState({ id: 's1', name: 'MCF', members: [] })
    )
    const parsed = ProjectSectionCatalogSchema.parse(JSON.parse(JSON.stringify(projected.catalog)))

    expect(parsed.repos.map((repo) => repo.id)).toEqual([mobileSectionRepoId('s1'), 'repo-a'])
    expect(parsed.projects).toEqual(base.catalog?.projects)
    expect(parsed.setups).toEqual(base.catalog?.setups)
    expect(parsed.projectOrderBy).toBe('manual')
  })

  it('returns the same result without a catalog or sections', () => {
    const none: MobileProjectSectionsResult = { catalog: null }
    const base = catalogOf(['repo-a', 'orca'])

    expect(
      projectCustomSectionsOntoCatalog(none, sectionsState({ id: 's', name: 'N', members: [] }))
    ).toBe(none)
    expect(projectCustomSectionsOntoCatalog(base, undefined)).toBe(base)
    expect(projectCustomSectionsOntoCatalog(base, sectionsState())).toBe(base)
  })
})

describe('what the projection leaves alone', () => {
  function deepFreeze<T>(value: T): T {
    if (typeof value === 'object' && value !== null) {
      Object.values(value).forEach(deepFreeze)
      Object.freeze(value)
    }
    return value
  }

  it('does not mutate the runtime result it was given', () => {
    const result = deepFreeze(psResult(psRow('a', { childWorktreeIds: ['b'] }), psRow('b')))
    const before = JSON.stringify(result)
    const state = deepFreeze(sectionsState({ id: 's1', name: 'MCF', members: ['|a'] }))
    const catalog = deepFreeze(catalogOf(['repo-a', 'orca']))
    const catalogBefore = JSON.stringify(catalog)

    expect(() => projectCustomSectionsOntoPs(result, state)).not.toThrow()
    expect(() => projectCustomSectionsOntoCatalog(catalog, state)).not.toThrow()
    expect(JSON.stringify(result)).toBe(before)
    expect(JSON.stringify(catalog)).toBe(catalogBefore)
  })

  it('files a row stored under both host spellings with the section that spells no host', () => {
    const projected = projectCustomSectionsOntoPs(
      psResult(psRow('a')),
      sectionsState(
        { id: 's1', name: 'With local', members: ['local|a'] },
        { id: 's2', name: 'No host', members: ['|a'] }
      )
    )

    expect(projected.worktrees[0]?.repoId).toBe(mobileSectionRepoId('s2'))
  })
})

describe('hasNamedCustomSections', () => {
  it.each([
    ['nothing is stored', undefined, false],
    ['only Pinned is stored', sectionsState(), false],
    [
      'the only other section has a blank name',
      sectionsState({ id: 's1', name: ' ', members: [] }),
      false
    ],
    ['a named section is stored', sectionsState({ id: 's1', name: 'MCF', members: [] }), true]
  ])('answers for the case where %s', (_label, stored, expected) => {
    expect(hasNamedCustomSections(stored)).toBe(expected)
  })
})
