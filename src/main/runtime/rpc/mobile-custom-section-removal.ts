/**
 * Fork-owned (richarddaros/orca): the phone reads a workspace's archive script by its `repoId`, and a card filed
 * under a sidebar section carries a stand-in repo id the host cannot find, so the phone skips the script and
 * deletes anyway. Refuse that delete here, unless the phone waived the script, and let it offer "Delete Anyway".
 */
import {
  hasNamedCustomSections,
  projectCustomSectionsOntoPs
} from '../../../shared/custom-sidebar-sections/mobile-section-projection'
import { LOCAL_EXECUTION_HOST_ID } from '../../../shared/execution-host'
import type { RuntimeWorktreePsResult } from '../../../shared/runtime-worktree-contracts'
import { WorktreeArchiveHookFailedError } from '../../../shared/worktree/archive-hook-removal-gate'
import { getExplicitWorktreeIdSelector } from '../runtime-worktree-selection'
import { storedSectionsFor, type SectionsContext } from './mobile-custom-sections'
import { supportsWorktreeVisibilitySourceDefaults } from './worktree-visibility-client-capability'
import type { RpcContext } from './core'

// Why: a card is filed by the same rows the phone lists, and the default page of 200 could leave it out.
const EVERY_ROW = 100_000

type RemovalParams = {
  worktree: string
  hostId?: string
  runHooks?: boolean
  allowFailedArchiveHook?: boolean
}

type RemovalContext = SectionsContext &
  Pick<RpcContext, 'clientCapabilities'> & {
    runtime: {
      getWorktreePs(
        limit: number,
        sourceDefaultsSupported: boolean,
        includeAgentWait: boolean
      ): Promise<RuntimeWorktreePsResult>
      getRepoHooks(selector: string): Promise<{ hooks: { scripts: { archive?: string } } | null }>
    }
  }

const FILED_UNDER_SECTION_NOTE =
  'This workspace is filed under a sidebar section, so the phone could not check its project’s archive script and asked to skip it. Delete it from the desktop to run the script, or delete anyway to skip it.'

async function hasArchiveScript(context: RemovalContext, repoId: string): Promise<boolean> {
  try {
    const { hooks } = await context.runtime.getRepoHooks(`id:${repoId}`)
    return Boolean(hooks?.scripts.archive?.trim())
  } catch {
    // Why: a script the host cannot read is unverified, and an unverified script is refused, not skipped.
    return true
  }
}

/** Throws the archive-hook refusal when this host's own phone deletes a sectioned card without running or waiving the script. */
export async function refuseSkippedArchiveHookForSectionMember(
  params: RemovalParams,
  context: RemovalContext
): Promise<void> {
  if (params.runHooks === true || params.allowFailedArchiveHook === true) {
    return
  }
  const stored = storedSectionsFor(context)
  const worktreeId = getExplicitWorktreeIdSelector(params.worktree)
  // Why: with no named section (only Pinned left) no card is filed, so the full row scan below would buy nothing.
  if (!hasNamedCustomSections(stored) || !worktreeId) {
    return
  }
  const rows = await context.runtime.getWorktreePs(
    EVERY_ROW,
    supportsWorktreeVisibilitySourceDefaults(context),
    false
  )
  const filedRows = projectCustomSectionsOntoPs(rows, stored)
  if (filedRows === rows) {
    return
  }
  // Why: `worktree.ps` omits the host of a local row, and the projection reads that as `local`; so does this match.
  const isTarget = (row: RuntimeWorktreePsResult['worktrees'][number]): boolean =>
    row.worktreeId === worktreeId &&
    (params.hostId === undefined || (row.hostId ?? LOCAL_EXECUTION_HOST_ID) === params.hostId)
  const real = rows.worktrees.find(isTarget)
  const filed = filedRows.worktrees.find(isTarget)
  if (!real || !filed || filed.repoId === real.repoId) {
    return
  }
  if (!(await hasArchiveScript(context, real.repoId))) {
    return
  }
  throw new WorktreeArchiveHookFailedError({
    worktreePath: real.path,
    outcome: 'unverifiable',
    output: FILED_UNDER_SECTION_NOTE
  })
}
