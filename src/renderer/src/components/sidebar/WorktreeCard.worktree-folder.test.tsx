import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'

// Fork (richarddaros/orca): default cards name the worktree folder under the title; the new card style names it beside the title.
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

async function renderCard(
  worktree: Worktree,
  cardRepo: Repo = repo,
  hideRepoBadge = true
): Promise<string> {
  const { default: WorktreeCard } = await import('./WorktreeCard')
  return renderToStaticMarkup(
    <WorktreeCard
      worktree={worktree}
      repo={cardRepo}
      isActive={false}
      hideRepoBadge={hideRepoBadge}
    />
  )
}

const folderLabelCount = (markup: string): number =>
  markup.split('data-worktree-card-folder').length - 1

// Why: the label's own classes decide whether it yields to the title; the rendered class list is what the user sees.
const folderLabelClasses = (markup: string): string[] =>
  (markup.match(/<span class="([^"]*)"[^>]*data-worktree-card-folder=""/)?.[1] ?? '').split(' ')

// Why: the icon is the only yellow part of the label; the name stays muted so it does not compete with the title.
const folderIconClasses = (markup: string): string[] =>
  (markup.match(/data-worktree-card-folder=""[^>]*><svg[^>]*class="([^"]*)"/)?.[1] ?? '').split(' ')

describe('WorktreeCard worktree folder', () => {
  // The first import loads the whole card tree; warming it here keeps that cost out of every test's own timeout.
  beforeAll(async () => {
    await import('./WorktreeCard')
  }, WORKTREE_CARD_IMPORT_TIMEOUT_MS)

  beforeEach(() => {
    settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle: false }
  })

  it('names the checkout folder under the title, ahead of the git identity', async () => {
    const markup = await renderCard(makeWorktree())

    expect(markup).toContain('title="/home/me/orca/workspaces/orca/pinfish"')
    expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
    expect(markup.indexOf('data-worktree-card-folder')).toBeLessThan(
      markup.indexOf('Detached HEAD')
    )
    expect(folderLabelCount(markup)).toBe(1)
    expect(folderLabelClasses(markup)).toContain('shrink-3')
  })

  it('names the folder ahead of the branch', async () => {
    const markup = await renderCard(makeWorktree({ branch: 'refs/heads/feat/branch-marker' }))
    const row = markup.slice(markup.indexOf('data-worktree-card-meta-row'))

    expect(row).toContain('branch-marker')
    expect(row.indexOf('data-worktree-card-folder')).toBeLessThan(row.indexOf('branch-marker'))
  })

  it('adds the row under the title for a card that had nothing else to show there', async () => {
    const markup = await renderCard(makeWorktree({ head: '' }))

    expect(markup).not.toContain('Detached HEAD')
    expect(markup).toContain('data-worktree-card-meta-row=""')
    expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
  })

  // Why both: the new card style overrides the compact layout, so the folder shows either way.
  it.each([false, true])(
    'names the folder beside the title in the new card style, without a row of its own (compact %s)',
    async (compactWorktreeCards) => {
      settings = { compactWorktreeCards, experimentalNewWorktreeCardStyle: true }
      const markup = await renderCard(makeWorktree({ head: '' }))

      expect(markup).toContain('title="/home/me/orca/workspaces/orca/pinfish"')
      expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
      expect(markup).not.toContain('data-worktree-card-meta-row=""')
      expect(markup.indexOf('data-worktree-card-folder')).toBeLessThan(markup.indexOf('Arrastar'))
      expect(folderLabelCount(markup)).toBe(1)
    }
  )

  it('keeps the new-style folder from shrinking under a long title', async () => {
    settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle: true }
    const classes = folderLabelClasses(await renderCard(makeWorktree({ head: '' })))

    expect(classes).toEqual(expect.arrayContaining(['shrink-0', 'max-w-24']))
    expect(classes).not.toContain('shrink-3')
  })

  it.each([false, true])(
    'fills the folder icon yellow and leaves the name muted (new card style %s)',
    async (experimentalNewWorktreeCardStyle) => {
      settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle }
      const markup = await renderCard(makeWorktree({ head: '' }))

      expect(folderIconClasses(markup)).toEqual(
        expect.arrayContaining(['fill-status-warning', 'text-status-warning'])
      )
      expect(folderLabelClasses(markup)).toContain('text-muted-foreground')
      // Why exact: any colour class on the name span would turn the whole label yellow.
      expect(markup).toContain('<span class="min-w-0 truncate font-mono">pinfish</span>')
    }
  )

  // Why: a class string alone passes even if the token leaves the theme, and the icon would render empty with no error.
  it('keeps the yellow folder tied to a theme token that main.css still declares', () => {
    const css = readFileSync(resolve('src/renderer/src/assets/main.css'), 'utf8')

    expect(css).toMatch(/--color-status-warning:\s*var\(--status-warning\);/)
    // Why two: the light and the dark theme each declare their own yellow.
    expect(css.match(/--status-warning:\s*#[0-9a-f]{6};/gi)).toHaveLength(2)
  })

  // Why: the template tests the path with len(trim(...)); a blank path must not draw an icon with an empty name.
  it.each([false, true])(
    'names no folder for an empty or blank path (new card style %s)',
    async (experimentalNewWorktreeCardStyle) => {
      settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle }

      for (const path of ['', '   ']) {
        const markup = await renderCard(makeWorktree({ head: '', path }))
        expect(folderLabelCount(markup)).toBe(0)
      }
    }
  )

  // Why: the fork parts are spread last in the registry, so an upstream element with the same name would be replaced without any error.
  it('names only card elements that upstream does not register', async () => {
    const { CARD_FORK_PARTS } = await import('./workspace-card/card-fork-parts')
    const { CARD_PRIMITIVES } = await import('./workspace-card/card-primitives')
    const { CARD_IDENTITY_PARTS } = await import('./workspace-card/card-identity-parts')
    const { CARD_ACTIVITY_PARTS } = await import('./workspace-card/card-activity-parts')
    const upstream = new Set([
      ...Object.keys(CARD_PRIMITIVES),
      ...Object.keys(CARD_IDENTITY_PARTS),
      ...Object.keys(CARD_ACTIVITY_PARTS)
    ])

    expect(Object.keys(CARD_FORK_PARTS)).not.toHaveLength(0)
    expect(Object.keys(CARD_FORK_PARTS).filter((name) => upstream.has(name))).toEqual([])
  })

  it('puts the project chip first, then the folder, then the title in the new card style', async () => {
    settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle: true }
    const markup = await renderCard(makeWorktree({ head: '' }), repo, false)
    const chip = markup.indexOf('aria-label="Project orca"')
    const folder = markup.indexOf('data-worktree-card-folder')

    expect(chip).toBeGreaterThan(-1)
    expect(chip).toBeLessThan(folder)
    expect(folder).toBeLessThan(markup.indexOf('Arrastar'))
  })

  it('keeps compact cards and folder workspaces as they were', async () => {
    settings = { compactWorktreeCards: true, experimentalNewWorktreeCardStyle: false }
    expect(await renderCard(makeWorktree())).not.toContain('data-worktree-card-folder')

    for (const experimentalNewWorktreeCardStyle of [false, true]) {
      settings = { compactWorktreeCards: false, experimentalNewWorktreeCardStyle }
      const folderMarkup = await renderCard(makeWorktree(), { ...repo, kind: 'folder' })
      expect(folderMarkup).not.toContain('data-worktree-card-folder')
    }
  })
})
