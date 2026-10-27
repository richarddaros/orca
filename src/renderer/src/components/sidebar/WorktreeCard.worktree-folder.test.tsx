import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

// Fork (richarddaros/orca): default cards name the worktree folder under the title.
let settings: Partial<GlobalSettings> | null = null
const WORKTREE_CARD_IMPORT_TIMEOUT_MS = 15_000

vi.mock('@/store', () => {
  const getState = () => ({
    deleteStateByWorktreeId: {},
    fetchHostedReviewForBranch: vi.fn(),
    fetchIssue: vi.fn(),
    fetchLinearIssue: vi.fn(),
    gitConflictOperationByWorktree: {},
    hostedReviewCache: {},
    issueCache: {},
    linearIssueCache: {},
    openModal: vi.fn(),
    projectGroups: [],
    remoteBranchConflictByWorktreeId: {},
    settings,
    sshConnectionStates: new Map(),
    sshTargetLabels: new Map(),
    updateWorktreeMeta: vi.fn(),
    workspacePortScan: null,
    worktreeCardProperties: ['status']
  })
  return {
    useAppStore: Object.assign((selector: (state: unknown) => unknown) => selector(getState()), {
      getState,
      subscribe: () => () => {}
    })
  }
})

vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))

vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('./use-worktree-activity-status', () => ({ useWorktreeActivityStatus: () => 'idle' }))
vi.mock('./use-worktree-sleep-state', () => ({ useIsSleepingWorktree: () => false }))
vi.mock('./CacheTimer', () => ({
  default: () => null,
  usePromptCacheCountdownStartedAt: () => null
}))
vi.mock('./WorktreeCardAgents', () => ({ default: () => null }))
vi.mock('./WorktreeContextMenu', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
  WORKTREE_NATIVE_CONTEXT_MENU_ATTR: 'data-worktree-native-context-menu',
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR: 'data-orca-context-menu-scope'
}))

const repo: Repo = {
  id: 'repo-1',
  path: '/repo',
  displayName: 'orca',
  badgeColor: '#999999',
  addedAt: 1
}

function makeWorktree(overrides: Partial<Worktree> = {}): Worktree {
  return {
    id: 'repo-1::/home/me/orca/workspaces/orca/pinfish',
    repoId: 'repo-1',
    path: '/home/me/orca/workspaces/orca/pinfish',
    displayName: 'Arrastar entre seções',
    branch: '',
    head: '260b8148c0ffee',
    isBare: false,
    isMainWorktree: false,
    comment: '',
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    isUnread: false,
    isPinned: false,
    sortOrder: 0,
    lastActivityAt: 1,
    ...overrides
  }
}

async function renderCard(worktree: Worktree, cardRepo: Repo = repo): Promise<string> {
  const { default: WorktreeCard } = await import('./WorktreeCard')
  return renderToStaticMarkup(
    <WorktreeCard worktree={worktree} repo={cardRepo} isActive={false} hideRepoBadge />
  )
}

describe('WorktreeCard worktree folder', () => {
  beforeEach(() => {
    settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle: false }
  })

  it(
    'names the checkout folder under the title, ahead of the git identity',
    async () => {
      const markup = await renderCard(makeWorktree())

      expect(markup).toContain('title="/home/me/orca/workspaces/orca/pinfish"')
      expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
      expect(markup.indexOf('data-worktree-card-folder')).toBeLessThan(
        markup.indexOf('Detached HEAD')
      )
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )

  it(
    'adds the row under the title for a card that had nothing else to show there',
    async () => {
      const markup = await renderCard(makeWorktree({ head: '' }))

      expect(markup).not.toContain('Detached HEAD')
      expect(markup).toContain('data-worktree-card-meta-row=""')
      expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )

  it(
    'keeps compact cards, the new card style and folder workspaces as they were',
    async () => {
      settings = { compactWorktreeCards: true, experimentalNewWorktreeCardStyle: false }
      expect(await renderCard(makeWorktree())).not.toContain('data-worktree-card-folder')

      settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle: true }
      expect(await renderCard(makeWorktree())).not.toContain('data-worktree-card-folder')

      settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle: false }
      const folderMarkup = await renderCard(makeWorktree(), { ...repo, kind: 'folder' })
      expect(folderMarkup).not.toContain('data-worktree-card-folder')
    },
    WORKTREE_CARD_IMPORT_TIMEOUT_MS
  )
})
