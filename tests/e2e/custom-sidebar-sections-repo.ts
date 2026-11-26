import { execFileSync } from 'node:child_process'
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type Page, type TestInfo } from '@stablyai/playwright-test'
import type { WorktreeMeta } from '../../src/shared/worktree/meta-types'

// Fork (richarddaros/orca): setup for the custom sidebar sections specs (issue #10). Upstream removed the shared
// repo-with-workspaces helpers these specs used, so the fork keeps its own copy here.

// Raw git worktree add bypasses Orca's 5s scan-cache invalidation; poll for 10s to cross the TTL and allow a slow scan.
const WORKTREE_CACHE_TTL_POLL_MS = 10_000

/** Poll budget for setup that makes one main write per item. */
function bulkWriteTimeout(items: number): number {
  return 10_000 + items * 500
}

type Outcome<Result> =
  | { state: 'pending' }
  | { state: 'done'; value: Result }
  | { state: 'failed'; error: string }

let nextKey = 0

// Poll preload outcomes rather than holding a CDP promise that may be garbage-collected; args cross as JSON.
async function evaluatePolled<Args, Result>(
  page: Page,
  run: (args: Args) => Promise<Result>,
  args: Args,
  options: { timeout?: number } = {}
): Promise<Result> {
  nextKey += 1
  const key = JSON.stringify(`__e2eEvaluatePolled${nextKey}`)
  await page.evaluate(`(() => {
    const run = ${run.toString()};
    globalThis[${key}] = { state: 'pending' };
    Promise.resolve()
      .then(() => run(${JSON.stringify(args)}))
      .then(
        (value) => { globalThis[${key}] = { state: 'done', value }; },
        (error) => { globalThis[${key}] = { state: 'failed', error: String(error) }; }
      );
  })()`)
  const read = () => page.evaluate<Outcome<Result>>(`globalThis[${key}]`)
  await expect
    .poll(async () => (await read()).state, {
      message: 'page work never settled',
      timeout: options.timeout
    })
    .not.toBe('pending')
  const outcome = await read()
  if (outcome.state !== 'done') {
    throw new Error(outcome.state === 'failed' ? outcome.error : 'page work never settled')
  }
  return outcome.value
}

// Poll past the scan-cache TTL until every raw-Git fixture worktree appears.
async function loadWorktreesUntilPathsPresent(
  page: Page,
  repoId: string,
  expectedPaths: string[]
): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(
          async ({ repoId, expectedPaths }) => {
            const store = window.__store
            if (!store) {
              throw new Error('window.__store is not available')
            }
            await store.getState().fetchWorktrees(repoId)
            const registered = new Set(
              (store.getState().worktreesByRepo[repoId] ?? []).map((entry) => entry.path)
            )
            return expectedPaths.every((entry) => registered.has(entry))
          },
          { repoId, expectedPaths }
        ),
      {
        timeout: WORKTREE_CACHE_TTL_POLL_MS,
        message: `Not all worktrees registered within the worktree-cache TTL window (${expectedPaths.length} expected)`
      }
    )
    .toBe(true)
}

export type RepoWithWorkspaces = {
  repoId: string
  /** The repo's own checkout, listed as its main workspace. */
  mainId: string
  /** One workspace id per requested count, in order. */
  ids: string[]
}

// Add a fresh repo through main so its requested worktrees never grow the worker's shared fixture repo.
export async function addRepoWithWorkspaces(
  page: Page,
  testInfo: TestInfo,
  count: number
): Promise<RepoWithWorkspaces> {
  const root = testInfo.outputPath('repo-with-workspaces')
  const repoPath = path.join(root, 'repo')
  mkdirSync(repoPath, { recursive: true })
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repoPath, stdio: 'pipe' })
  git('init', '-b', 'main')
  writeFileSync(path.join(repoPath, 'README.md'), 'workspaces\n')
  git('add', 'README.md')
  git('-c', 'user.name=E2E', '-c', 'user.email=e2e@test.local', 'commit', '-m', 'init')
  const realRoot = realpathSync(root)
  const worktreePaths = Array.from({ length: count }, (_, index) => {
    const worktreePath = path.join(realRoot, `workspace-${index}`)
    git('worktree', 'add', '-q', '-b', `workspace-${index}`, worktreePath)
    return worktreePath
  })
  const realRepoPath = realpathSync(repoPath)
  const repoId = await evaluatePolled(
    page,
    async (repoPath) => {
      const added = await window.api.repos.add({ path: repoPath })
      if ('error' in added) {
        throw new Error(added.error)
      }
      return added.repo.id
    },
    realRepoPath
  )
  // The add's own refresh can supersede the helper's fetch, and updateRepo skips a repo the store lacks.
  await expect
    .poll(
      () =>
        page.evaluate(async (repoId) => {
          const store = window.__store!
          await store.getState().fetchRepos({ runtimeEnvironmentId: null, throwOnError: true })
          return store.getState().repos.some((repo) => repo.id === repoId)
        }, repoId),
      { message: 'the added repo never reached the store' }
    )
    .toBe(true)
  await evaluatePolled(
    page,
    async (repoId) => {
      // Checkouts made outside Orca's workspace root are hidden by default.
      const shown = await window
        .__store!.getState()
        .updateRepo(repoId, { externalWorktreeVisibility: 'show' })
      if (!shown) {
        throw new Error(`could not show external worktrees for ${repoId}`)
      }
    },
    repoId
  )
  await loadWorktreesUntilPathsPresent(page, repoId, [realRepoPath, ...worktreePaths])
  const idByPath = await page.evaluate(
    (repoId) =>
      Object.fromEntries(
        (window.__store!.getState().worktreesByRepo[repoId] ?? []).map((worktree) => [
          worktree.path,
          worktree.id
        ])
      ),
    repoId
  )
  return {
    repoId,
    mainId: idByPath[realRepoPath]!,
    ids: worktreePaths.map((worktreePath) => idByPath[worktreePath]!)
  }
}

export async function writeWorkspaceMeta(
  page: Page,
  updates: { worktreeId: string; updates: Partial<WorktreeMeta> }[]
): Promise<void> {
  await evaluatePolled(
    page,
    async (updates) => {
      // The store keeps its own copy when main refuses, so check main's listing.
      await window.__store!.getState().updateWorktreesMeta(updates)
      const repoIds = [...new Set(updates.map(({ worktreeId }) => worktreeId.split('::')[0]!))]
      const listed = new Map(
        (await Promise.all(repoIds.map((repoId) => window.api.worktrees.listDetected({ repoId }))))
          .flatMap((result) => result.worktrees.filter((worktree) => worktree.visible))
          .map((worktree) => [worktree.id, worktree])
      )
      for (const { worktreeId, updates: written } of updates) {
        const worktree = listed.get(worktreeId)
        if (!worktree) {
          throw new Error(`main does not list ${worktreeId}`)
        }
        const kept = new Map(Object.entries(worktree))
        for (const [field, value] of Object.entries(written)) {
          if (JSON.stringify(kept.get(field)) !== JSON.stringify(value)) {
            throw new Error(`main did not keep ${field} for ${worktreeId}`)
          }
        }
      }
    },
    updates,
    { timeout: bulkWriteTimeout(updates.length) }
  )
}
