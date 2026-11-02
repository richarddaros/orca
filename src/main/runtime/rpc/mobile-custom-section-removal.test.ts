import './unused-default-rpc-methods.test-fixture'
import { describe, expect, it, vi } from 'vitest'
import {
  psResult,
  psRow,
  sectionsState
} from '../../../shared/custom-sidebar-sections/mobile-section-projection.test-fixture'
import { ARCHIVE_HOOK_FAILED_REMOVAL_CODE } from '../../../shared/worktree/archive-hook-removal-gate'
import type { OrcaRuntimeService } from '../orca-runtime'
import { RpcDispatcher } from './dispatcher'
import { refuseSkippedArchiveHookForSectionMember } from './mobile-custom-section-removal'
import { WORKTREE_METHODS } from './methods/worktree'

const ARCHIVE_SCRIPT = { hooks: { scripts: { archive: 'scripts/archive.sh' } } }
const NO_SCRIPT = { hooks: { scripts: {} } }

type ClientKind = { clientKind?: 'mobile' | 'runtime'; pairedDeviceParentId?: string }

function setup(
  options: {
    rows?: ReturnType<typeof psResult>
    sections?: unknown
    hooks?: () => Promise<{ hooks: { scripts: { archive?: string } } | null }>
  } = {}
) {
  const rows =
    options.rows ??
    psResult(
      psRow('a', { repoId: 'real-repo', path: '/work/a' }),
      psRow('b', { repoId: 'real-repo' })
    )
  // Why: the real listing returns one page, so a stub that ignores the limit would hide a guard that reads too few rows.
  const getWorktreePs = vi.fn(async (limit: number) => ({
    ...rows,
    worktrees: rows.worktrees.slice(0, limit)
  }))
  const getRepoHooks = vi.fn(options.hooks ?? (async () => ARCHIVE_SCRIPT))
  const stored =
    'sections' in options
      ? options.sections
      : sectionsState({ id: 's1', name: 'MCF', members: ['|a'] })
  const runtime = {
    getWorktreePs,
    getRepoHooks,
    requireStore: () => ({ getUI: () => ({ customSidebarSections: stored }) })
  }
  const run = (
    params: Partial<Parameters<typeof refuseSkippedArchiveHookForSectionMember>[0]>,
    client: ClientKind = { clientKind: 'mobile' }
  ) =>
    refuseSkippedArchiveHookForSectionMember(
      { worktree: 'id:a', runHooks: false, ...params },
      { ...client, runtime }
    )
  return { run, getWorktreePs, getRepoHooks, runtime }
}

describe('refuseSkippedArchiveHookForSectionMember', () => {
  it('refuses a sectioned card whose project has an archive script, as the app’s archive failure', async () => {
    const { run, getRepoHooks } = setup()

    await expect(run({})).rejects.toMatchObject({
      code: ARCHIVE_HOOK_FAILED_REMOVAL_CODE,
      data: { worktreePath: '/work/a', outcome: 'unverifiable' },
      message: expect.stringContaining('delete anyway')
    })
    // Why: the script is read from the real project, not from the section's stand-in.
    expect(getRepoHooks).toHaveBeenCalledWith('id:real-repo')
  })

  it('refuses a sectioned card that sits past the default page of the listing', async () => {
    const crowd = psResult(
      ...Array.from({ length: 300 }, (_, index) =>
        psRow(index === 250 ? 'a' : `filler-${index}`, { repoId: 'real-repo' })
      )
    )

    await expect(setup({ rows: crowd }).run({})).rejects.toMatchObject({
      code: ARCHIVE_HOOK_FAILED_REMOVAL_CODE
    })
  })

  it('refuses a card that follows a sectioned parent by lineage', async () => {
    const { run } = setup({
      rows: psResult(
        psRow('a', { repoId: 'real-repo', childWorktreeIds: ['kid'] }),
        psRow('kid', { repoId: 'real-repo', parentWorktreeId: 'a', path: '/work/kid' })
      )
    })

    await expect(run({ worktree: 'id:kid' })).rejects.toMatchObject({
      code: ARCHIVE_HOOK_FAILED_REMOVAL_CODE
    })
  })

  it.each([
    ['the phone ran the script', { runHooks: true }],
    ['the phone waived the script', { allowFailedArchiveHook: true }]
  ])('lets the delete through when %s', async (_label, params) => {
    const { run, getWorktreePs } = setup()

    await expect(run(params)).resolves.toBeUndefined()
    expect(getWorktreePs).not.toHaveBeenCalled()
  })

  it.each([
    ['no archive script', async () => NO_SCRIPT],
    ['a blank archive script', async () => ({ hooks: { scripts: { archive: '  ' } } })],
    ['no hooks at all', async () => ({ hooks: null })]
  ])('lets the delete through when the project has %s', async (_label, hooks) => {
    await expect(setup({ hooks }).run({})).resolves.toBeUndefined()
  })

  it('refuses when the host cannot read the project’s hooks', async () => {
    const { run } = setup({
      hooks: async () => {
        throw new Error('repo_not_found')
      }
    })

    await expect(run({})).rejects.toMatchObject({ code: ARCHIVE_HOOK_FAILED_REMOVAL_CODE })
  })

  it.each([
    ['a card outside every section', { worktree: 'id:b' }],
    ['a workspace the host does not list', { worktree: 'id:ghost' }]
  ])('lets the delete through for %s', async (_label, params) => {
    await expect(setup().run(params)).resolves.toBeUndefined()
  })

  describe('when the caller names the host', () => {
    const twins = psResult(
      psRow('a', { repoId: 'real-repo', hostId: 'ssh:builder', path: '/builder/a' }),
      psRow('a', { repoId: 'real-repo', path: '/work/a' })
    )
    const filedOnBuilder = sectionsState({ id: 's1', name: 'MCF', members: ['ssh:builder|a'] })

    it('refuses the copy it names and lets its same-id twin through', async () => {
      const { run } = setup({ rows: twins, sections: filedOnBuilder })

      await expect(run({ hostId: 'ssh:builder' })).rejects.toMatchObject({
        code: ARCHIVE_HOOK_FAILED_REMOVAL_CODE,
        data: { worktreePath: '/builder/a' }
      })
      await expect(run({ hostId: 'local' })).resolves.toBeUndefined()
    })

    it('reads a local row without a host as the local host', async () => {
      const { run } = setup()

      await expect(run({ hostId: 'local' })).rejects.toMatchObject({
        code: ARCHIVE_HOOK_FAILED_REMOVAL_CODE
      })
      await expect(run({ hostId: 'ssh:builder' })).resolves.toBeUndefined()
    })
  })

  it('lets a selector that is not an id through without reading the rows', async () => {
    const { run, getWorktreePs } = setup()

    await expect(run({ worktree: 'branch-name' })).resolves.toBeUndefined()
    expect(getWorktreePs).not.toHaveBeenCalled()
  })

  it('lets a pinned member through, since it stays in Pinned', async () => {
    const { run } = setup({
      rows: psResult(psRow('a', { repoId: 'real-repo', isPinned: true }))
    })

    await expect(run({})).resolves.toBeUndefined()
  })

  it.each([
    ['no section is stored', undefined],
    ['only Pinned is stored', sectionsState()]
  ])('lets the delete through when %s', async (_label, sections) => {
    const { run, getRepoHooks, getWorktreePs } = setup({ sections })

    await expect(run({})).resolves.toBeUndefined()
    expect(getWorktreePs).not.toHaveBeenCalled()
    expect(getRepoHooks).not.toHaveBeenCalled()
  })

  it.each([
    ['a delegated phone', { clientKind: 'mobile' as const, pairedDeviceParentId: 'desktop-2' }],
    ['the web client', { clientKind: 'runtime' as const }],
    ['a caller with no client kind', {}]
  ])('never looks at the rows for %s', async (_label, client) => {
    const { run, getWorktreePs } = setup()

    await expect(run({}, client)).resolves.toBeUndefined()
    expect(getWorktreePs).not.toHaveBeenCalled()
  })
})

describe('worktree.rm', () => {
  function dispatcher() {
    const { runtime, getWorktreePs } = setup()
    const removeManagedWorktree = vi.fn(async () => ({}))
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only these runtime members up to the removal.
    const typed = {
      ...runtime,
      getRuntimeId: () => 'test-runtime',
      listRepos: () => [],
      showManagedWorktree: async () => ({ hostId: 'local' }),
      removeManagedWorktree
    } as unknown as OrcaRuntimeService
    return {
      getWorktreePs,
      removeManagedWorktree,
      dispatcher: new RpcDispatcher({ runtime: typed, methods: WORKTREE_METHODS })
    }
  }

  const rm = (params: Record<string, unknown>) => ({
    id: 'r',
    authToken: 't',
    method: 'worktree.rm',
    params: { worktree: 'id:a', force: true, ...params }
  })

  it('refuses the host’s own phone with the archive failure before removing anything', async () => {
    const { dispatcher: d, removeManagedWorktree } = dispatcher()
    const reply = JSON.parse(
      JSON.stringify(await d.dispatch(rm({ runHooks: false }), { clientKind: 'mobile' }))
    )

    expect(reply.ok).toBe(false)
    expect(reply.error.code).toBe(ARCHIVE_HOOK_FAILED_REMOVAL_CODE)
    expect(removeManagedWorktree).not.toHaveBeenCalled()
  })

  it('removes the card once the phone waives the script (Delete Anyway)', async () => {
    const { dispatcher: d, removeManagedWorktree } = dispatcher()
    const reply = JSON.parse(
      JSON.stringify(
        await d.dispatch(rm({ runHooks: false, allowFailedArchiveHook: true }), {
          clientKind: 'mobile'
        })
      )
    )

    expect(reply.ok).toBe(true)
    expect(removeManagedWorktree).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['the web client', { clientKind: 'runtime' as const }],
    ['a delegated phone', { clientKind: 'mobile' as const, pairedDeviceParentId: 'desktop-2' }],
    ['a caller with no client kind', {}]
  ])('removes the card for %s without reading the rows', async (_label, client) => {
    const { dispatcher: d, removeManagedWorktree, getWorktreePs } = dispatcher()
    const reply = JSON.parse(JSON.stringify(await d.dispatch(rm({ runHooks: false }), client)))

    expect(reply.ok).toBe(true)
    expect(removeManagedWorktree).toHaveBeenCalledTimes(1)
    expect(getWorktreePs).not.toHaveBeenCalled()
  })
})
