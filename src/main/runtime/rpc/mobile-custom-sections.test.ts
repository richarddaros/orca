import './unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import { mobileSectionRepoId } from '../../../shared/custom-sidebar-sections/mobile-section-projection'
import {
  catalogOf,
  psResult,
  psRow,
  sectionsState
} from '../../../shared/custom-sidebar-sections/mobile-section-projection.test-fixture'
import type { OrcaRuntimeService } from '../orca-runtime'
import { publishMobileProjectSections } from '../mobile-project-sections-snapshot'
import { RpcDispatcher } from './dispatcher'
import { MOBILE_PROJECT_SECTIONS_METHODS } from './methods/mobile-project-sections'
import { WORKTREE_CATALOG_METHODS } from './methods/worktree-catalog-methods'
import {
  projectProjectSectionsCustomSections,
  projectWorktreePsCustomSections
} from './mobile-custom-sections'

describe('who sees the sections', () => {
  const stored = sectionsState({ id: 's1', name: 'MCF', members: ['|a'] })

  function contextWith(
    client: { clientKind?: 'mobile' | 'runtime'; pairedDeviceParentId?: string },
    ui: { customSidebarSections?: unknown }
  ) {
    return { ...client, runtime: { requireStore: () => ({ getUI: () => ui }) } }
  }
  const contextFor = (client: {
    clientKind?: 'mobile' | 'runtime'
    pairedDeviceParentId?: string
  }) => contextWith(client, { customSidebarSections: stored })

  it('projects for this host’s own phone only', () => {
    const result = psResult(psRow('a'))
    const catalog = catalogOf(['repo-a', 'orca'])

    expect(
      projectWorktreePsCustomSections(result, contextFor({ clientKind: 'mobile' })).worktrees[0]
        ?.repoId
    ).toBe(mobileSectionRepoId('s1'))
    expect(
      projectProjectSectionsCustomSections(catalog, contextFor({ clientKind: 'mobile' })).catalog
        ?.repos
    ).toHaveLength(2)

    for (const other of [
      { clientKind: 'mobile' as const, pairedDeviceParentId: 'desktop-2' },
      { clientKind: 'runtime' as const },
      {}
    ]) {
      expect(projectWorktreePsCustomSections(result, contextFor(other))).toBe(result)
      expect(projectProjectSectionsCustomSections(catalog, contextFor(other))).toBe(catalog)
    }
  })

  it('leaves the replies alone when the store holds no UI state reader or no sections', () => {
    const result = psResult(psRow('a'))
    const noReader = { clientKind: 'mobile' as const, runtime: { requireStore: () => ({}) } }

    expect(projectWorktreePsCustomSections(result, noReader)).toBe(result)
    expect(projectWorktreePsCustomSections(result, contextWith({ clientKind: 'mobile' }, {}))).toBe(
      result
    )
  })
})

describe('the RPC methods', () => {
  let stored = sectionsState({ id: 's1', name: 'MCF', members: ['|a'] })

  function dispatcher(methods: ConstructorParameters<typeof RpcDispatcher>[0]['methods']) {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the two handlers read only these runtime members.
    const runtime = {
      getRuntimeId: () => 'test-runtime',
      getWorktreePs: vi.fn(async () => psResult(psRow('a'), psRow('b'))),
      pairedServerRows: undefined,
      requireStore: () => ({
        getUI: () => ({ customSidebarSections: stored }),
        getRepos: () => [],
        getProjectGroups: () => [],
        getFolderWorkspaces: () => [],
        getSshTargets: () => [],
        getProjectHostSetups: () => []
      })
    } as unknown as OrcaRuntimeService
    return new RpcDispatcher({ runtime, methods })
  }

  const request = (method: string, params: Record<string, unknown> = {}) => ({
    id: 'r',
    authToken: 't',
    method,
    params
  })
  const resultOf = (reply: unknown) => JSON.parse(JSON.stringify(reply)).result

  it('worktree.ps files the sections for the host’s own phone and not for the web client', async () => {
    const d = dispatcher(WORKTREE_CATALOG_METHODS)
    const phone = await d.dispatch(request('worktree.ps'), { clientKind: 'mobile' })
    const web = await d.dispatch(request('worktree.ps'), { clientKind: 'runtime' })

    const repoIds = (reply: unknown) =>
      JSON.parse(JSON.stringify(reply)).result.worktrees.map(
        (row: { repoId: string }) => row.repoId
      )
    expect(repoIds(phone)).toEqual([mobileSectionRepoId('s1'), 'repo-a'])
    expect(repoIds(web)).toEqual(['repo-a', 'repo-a'])
  })

  it('worktree.ps polls see a section change on the phone while the web client sees none', async () => {
    stored = sectionsState({ id: 's1', name: 'MCF', members: ['|a'] })
    const d = dispatcher(WORKTREE_CATALOG_METHODS)
    const poll = (client: 'mobile' | 'runtime', afterSnapshotId: string | null) =>
      d
        .dispatch(request('worktree.ps', { afterSnapshotId, acceptRowDelta: true }), {
          clientKind: client
        })
        .then(resultOf)
    const phoneBefore = await poll('mobile', null)
    const webBefore = await poll('runtime', null)

    // Why: the snapshot id is computed over the rows each client is sent, so it differs between them.
    expect(phoneBefore.worktrees[0].repoId).toBe(mobileSectionRepoId('s1'))
    expect(phoneBefore.snapshotId).not.toBe(webBefore.snapshotId)

    stored = sectionsState({ id: 's1', name: 'Renamed', members: ['|a'] })
    const phoneAfter = await poll('mobile', phoneBefore.snapshotId)
    const webAfter = await poll('runtime', webBefore.snapshotId)

    expect(phoneAfter.unchanged).toBeUndefined()
    expect(
      phoneAfter.rowsFromBase.some(
        (row: unknown) =>
          typeof row === 'object' && row !== null && 'repo' in row && row.repo === 'Renamed'
      )
    ).toBe(true)
    expect(webAfter).toEqual({ unchanged: true, snapshotId: webBefore.snapshotId })
  })

  it('mobileRelay.projectSections lists the stand-in repos for the host’s own phone only', async () => {
    const catalog = catalogOf(['repo-a', 'orca']).catalog
    if (!catalog) {
      throw new Error('fixture catalog missing')
    }
    publishMobileProjectSections(catalog)
    const d = dispatcher(MOBILE_PROJECT_SECTIONS_METHODS)
    const phone = await d.dispatch(request('mobileRelay.projectSections'), { clientKind: 'mobile' })
    const delegated = await d.dispatch(request('mobileRelay.projectSections'), {
      clientKind: 'mobile',
      pairedDeviceParentId: 'desktop-2'
    })
    const web = await d.dispatch(request('mobileRelay.projectSections'), { clientKind: 'runtime' })

    const repoIds = (reply: unknown): string[] =>
      JSON.parse(JSON.stringify(reply)).result.catalog.repos.map((repo: { id: string }) => repo.id)
    expect(repoIds(phone)).toEqual([mobileSectionRepoId('s1'), 'repo-a'])
    expect(repoIds(delegated)).toEqual(['repo-a'])
    expect(repoIds(web)).toEqual(['repo-a'])
  })
})
