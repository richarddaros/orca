import { describe, expect, it, vi } from 'vitest'
import {
  psResult,
  psRow,
  sectionsState
} from '../../../shared/custom-sidebar-sections/mobile-section-projection.test-fixture'
import { ARCHIVE_HOOK_FAILED_REMOVAL_CODE } from '../../../shared/worktree/removal/archive-hook-removal-gate'
import type { OrcaRuntimeService } from '../orca-runtime'
import { RpcDispatcher } from './dispatcher'
import { ALL_RPC_METHODS } from './methods/rpc-method-registry'

// Fork (richarddaros/orca): mobile-custom-section-removal.test.ts proves the guard on its own. This file proves it sits
// in the registry the host serves, so a conflict that drops it from there fails here and not on a phone.
// Why a file of its own: tests that name their methods mock the default registry away; this one needs the real one.

function setup() {
  const rows = psResult(psRow('a', { repoId: 'real-repo', path: '/work/a' }))
  const removeManagedWorktree = vi.fn(async () => ({}))
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the handler reads only these runtime members up to the removal.
  const runtime = {
    getWorktreePs: async () => rows,
    getRepoHooks: async () => ({ hooks: { scripts: { archive: 'scripts/archive.sh' } } }),
    requireStore: () => ({
      getUI: () => ({
        customSidebarSections: sectionsState({ id: 's1', name: 'MCF', members: ['|a'] })
      })
    }),
    getRuntimeId: () => 'test-runtime',
    listRepos: () => [],
    showManagedWorktree: async () => ({ hostId: 'local' }),
    removeManagedWorktree
  } as unknown as OrcaRuntimeService
  return {
    removeManagedWorktree,
    dispatcher: new RpcDispatcher({ runtime, methods: ALL_RPC_METHODS })
  }
}

const rm = (params: Record<string, unknown>) => ({
  id: 'r',
  authToken: 't',
  method: 'worktree.rm',
  params: { worktree: 'id:a', force: true, runHooks: false, ...params }
})

describe('worktree.rm in the registry the host serves', () => {
  it('refuses the host’s own phone for a sectioned card before removing anything', async () => {
    const { dispatcher, removeManagedWorktree } = setup()
    const reply = JSON.parse(
      JSON.stringify(await dispatcher.dispatch(rm({}), { clientKind: 'mobile' }))
    )

    expect(reply.ok).toBe(false)
    expect(reply.error.code).toBe(ARCHIVE_HOOK_FAILED_REMOVAL_CODE)
    expect(removeManagedWorktree).not.toHaveBeenCalled()
  })

  // Why: without this the refusal above could be a method that does not exist, which also fails to remove.
  it('reaches the real handler and removes the card once the phone waives the script', async () => {
    const { dispatcher, removeManagedWorktree } = setup()
    const reply = JSON.parse(
      JSON.stringify(
        await dispatcher.dispatch(rm({ allowFailedArchiveHook: true }), { clientKind: 'mobile' })
      )
    )

    expect(reply.ok).toBe(true)
    expect(removeManagedWorktree).toHaveBeenCalledTimes(1)
  })
})
