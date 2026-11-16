import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { CardTemplateNode } from '../../../../../shared/workspace-cards/card-template-schema'
import type {
  WorkspaceCardFacts,
  WorkspaceCardStyle
} from '../../../../../shared/workspace-cards/workspace-card-facts'
import type { WorktreeCardController } from './controller/use-worktree-card-controller'
import { CARD_FORK_PARTS } from './card-fork-parts'
import { CARD_ACTIVITY_PARTS } from './template/card-activity-parts'
import { WORKSPACE_CARD_ELEMENTS } from './template/card-element-registry'
import { CARD_IDENTITY_PARTS } from './template/card-identity-parts'
import { CARD_PRIMITIVES } from './template/card-primitives'
import {
  cardElement,
  compileCardTemplate,
  type CardElement
} from './template/card-template-compiler'
import { DEFAULT_WORKSPACE_CARD_TEMPLATE } from './template/default-workspace-card'

// Fork (richarddaros/orca): default cards name the worktree folder under the title; the new card style names it beside the title.
// Why the template and not the whole card: the template is what upstream draws cards from, and it needs no store, so a
// move of an upstream part cannot break this file. Upstream parts are stubs; the fork's folder part is the real one.

type Card = WorktreeCardController

function stubParts(): Record<string, CardElement<Card>> {
  const propsByPart = new Map<string, Set<string>>()
  const defs = DEFAULT_WORKSPACE_CARD_TEMPLATE.defs ?? {}
  const visit = (node: CardTemplateNode): void => {
    const known =
      Object.hasOwn(CARD_PRIMITIVES, node.el) ||
      Object.hasOwn(defs, node.el) ||
      Object.hasOwn(CARD_FORK_PARTS, node.el)
    if (!known) {
      const props = propsByPart.get(node.el) ?? new Set<string>()
      Object.keys(node.props ?? {}).forEach((prop) => props.add(prop))
      propsByPart.set(node.el, props)
    }
    node.children?.forEach(visit)
  }
  visit(DEFAULT_WORKSPACE_CARD_TEMPLATE.root)
  Object.values(defs).forEach(visit)
  return Object.fromEntries(
    [...propsByPart].map(([name, props]) => [
      name,
      cardElement<Card>([...props], (_props, children) => <span data-part={name}>{children}</span>)
    ])
  )
}

const compiled = compileCardTemplate<Card>(DEFAULT_WORKSPACE_CARD_TEMPLATE, {
  ...CARD_PRIMITIVES,
  ...stubParts(),
  ...CARD_FORK_PARTS
})

const PATH = '/home/me/orca/workspaces/orca/pinfish'

type Variant = {
  style?: WorkspaceCardStyle
  kind?: 'git' | 'folder'
  path?: string
  branch?: string
  detachedHead?: boolean
  withProjectChip?: boolean
  detailsRow?: boolean
}

function facts({
  style = 'classic',
  kind = 'git',
  path = PATH,
  branch = '',
  detachedHead = false,
  withProjectChip = false,
  detailsRow = true
}: Variant): WorkspaceCardFacts {
  return {
    ws: {
      id: 'wt-1',
      name: 'Arrastar entre seções',
      title: 'Arrastar entre seções',
      kind,
      path,
      branch,
      identity: null,
      isMain: false,
      isSparse: false,
      detachedHead,
      isPinned: false,
      isUnread: false,
      isDeleting: false,
      isRenaming: false,
      hasRenameError: false,
      removalError: null,
      comment: ''
    },
    repo: withProjectChip ? { id: 'repo-1', name: 'orca', ssh: false } : null,
    host: { kind: 'local', contextLabel: null, runtimeDisconnected: false },
    git: { conflictOperation: null, remoteBranchConflict: null, cacheTimerActive: false },
    review: null,
    checks: { total: 0, passing: 0, failing: 0, pending: 0 },
    links: { count: 0, issue: false, linearIssue: false, jiraIssue: false },
    provenance: { automation: false, cli: false },
    ports: { count: 0 },
    lineage: { childCount: 0, collapsed: false, toggleable: false },
    place: {
      isActive: false,
      inPinnedSection: false,
      hideRepoBadge: !withProjectChip,
      showProjectName: false,
      affiliateList: false,
      deleteQuickAction: false
    },
    options: {
      style,
      show: {
        status: true,
        unread: true,
        ci: true,
        branch: false,
        issue: true,
        linearIssue: true,
        jiraIssue: true,
        pr: true,
        automation: true,
        cli: true,
        comment: true,
        ports: true,
        inlineAgents: false,
        host: true
      },
      detailsRow,
      agentRows: 'full'
    },
    env: { projectGroups: false }
  }
}

function renderCard(variant: Variant = {}): string {
  const path = variant.path ?? PATH
  // Why a partial controller: the folder part reads only `worktree.path`.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the part under test reads nothing else.
  const card = { worktree: { path } } as unknown as Card
  return renderToStaticMarkup(<>{compiled.render(facts(variant), card).content}</>)
}

const part = (name: string): string => `data-part="${name}"`
const FOLDER = 'data-worktree-card-folder'
const folderLabelCount = (markup: string): number => markup.split(FOLDER).length - 1

// Why: the label's own classes decide whether it yields to the title; the rendered class list is what the user sees.
const folderLabelClasses = (markup: string): string[] =>
  (markup.match(/<span class="([^"]*)"[^>]*data-worktree-card-folder=""/)?.[1] ?? '').split(' ')

// Why: the icon is the only yellow part of the label; the name stays muted so it does not compete with the title.
const folderIconClasses = (markup: string): string[] =>
  (markup.match(/data-worktree-card-folder=""[^>]*><svg[^>]*class="([^"]*)"/)?.[1] ?? '').split(' ')

describe('card folder part', () => {
  it('names the checkout folder under the title, ahead of the git identity', () => {
    const markup = renderCard({ detachedHead: true })

    expect(markup).toContain(`title="${PATH}"`)
    expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
    expect(markup.indexOf(FOLDER)).toBeLessThan(markup.indexOf(part('DetachedHead')))
    expect(folderLabelCount(markup)).toBe(1)
    expect(folderLabelClasses(markup)).toContain('shrink-3')
  })

  it('names the folder ahead of the branch', () => {
    const markup = renderCard({ branch: 'feat/branch-marker' })
    const row = markup.slice(markup.indexOf('data-worktree-card-meta-row'))

    expect(row).toContain(part('Branch'))
    expect(row.indexOf(FOLDER)).toBeLessThan(row.indexOf(part('Branch')))
  })

  it('adds the row under the title for a card that had nothing else to show there', () => {
    const markup = renderCard()

    expect(markup).not.toContain(part('DetachedHead'))
    expect(markup).toContain('data-worktree-card-meta-row=""')
    expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
  })

  it('names the folder beside the title in the new card style, without a row of its own', () => {
    const markup = renderCard({ style: 'new' })

    expect(markup).toContain(`title="${PATH}"`)
    expect(markup).toMatch(/data-worktree-card-folder=""[^]*>pinfish<\/span>/)
    expect(markup).not.toContain('data-worktree-card-meta-row=""')
    expect(markup.indexOf(FOLDER)).toBeLessThan(markup.indexOf(part('Title')))
    expect(folderLabelCount(markup)).toBe(1)
  })

  it('keeps the folder beside the title in the new card style when the details row is off', () => {
    const markup = renderCard({ style: 'new', detailsRow: false })

    expect(folderLabelCount(markup)).toBe(1)
    expect(markup.indexOf(FOLDER)).toBeLessThan(markup.indexOf(part('Title')))
  })

  it('keeps the new-style folder from shrinking under a long title', () => {
    const classes = folderLabelClasses(renderCard({ style: 'new' }))

    expect(classes).toEqual(expect.arrayContaining(['shrink-0', 'max-w-24']))
    expect(classes).not.toContain('shrink-3')
  })

  it.each<WorkspaceCardStyle>(['classic', 'new'])(
    'fills the folder icon yellow and leaves the name muted (%s card style)',
    (style) => {
      const markup = renderCard({ style })

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
  it.each<WorkspaceCardStyle>(['classic', 'new'])(
    'names no folder for an empty or blank path (%s card style)',
    (style) => {
      for (const path of ['', '   ']) {
        expect(folderLabelCount(renderCard({ style, path }))).toBe(0)
      }
    }
  )

  // Why: the fork parts are spread last in the registry, so an upstream element with the same name would be replaced without any error.
  it('names only card elements that upstream does not register', () => {
    const upstream = new Set([
      ...Object.keys(CARD_PRIMITIVES),
      ...Object.keys(CARD_IDENTITY_PARTS),
      ...Object.keys(CARD_ACTIVITY_PARTS)
    ])

    expect(Object.keys(CARD_FORK_PARTS)).not.toHaveLength(0)
    expect(Object.keys(CARD_FORK_PARTS).filter((name) => upstream.has(name))).toEqual([])
  })

  // Why: the stubs above hide the registry the app compiles with; a fork part dropped from it makes the sidebar throw "unknown element".
  it('registers the fork parts in the registry the app compiles the default card with', () => {
    expect(() =>
      compileCardTemplate<Card>(DEFAULT_WORKSPACE_CARD_TEMPLATE, WORKSPACE_CARD_ELEMENTS)
    ).not.toThrow()
    for (const [name, element] of Object.entries(CARD_FORK_PARTS)) {
      expect(WORKSPACE_CARD_ELEMENTS[name]).toBe(element)
    }
  })

  it('puts the project chip first, then the folder, then the title in the new card style', () => {
    const markup = renderCard({ style: 'new', withProjectChip: true })
    const chip = markup.indexOf(part('RepoChip'))

    expect(chip).toBeGreaterThan(-1)
    expect(chip).toBeLessThan(markup.indexOf(FOLDER))
    expect(markup.indexOf(FOLDER)).toBeLessThan(markup.indexOf(part('Title')))
  })

  it('keeps compact cards and folder workspaces as they were', () => {
    expect(renderCard({ style: 'compact' })).not.toContain(FOLDER)

    for (const style of ['classic', 'new'] as const) {
      expect(renderCard({ style, kind: 'folder' })).not.toContain(FOLDER)
    }
  })
})
