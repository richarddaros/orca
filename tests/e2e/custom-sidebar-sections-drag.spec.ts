import type { Locator, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { addRepoWithWorkspaces, writeWorkspaceMeta } from './helpers/repo-with-workspaces'
import { waitForSessionReady } from './helpers/store'

// Fork (richarddaros/orca): dragging cards into, between and out of user sections, issue #10.
test.use({ seedTestRepo: false })

async function createSection(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New section' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()
  await expect(
    page.locator('[data-worktree-sidebar]').getByText(name, { exact: true })
  ).toBeVisible()
}

async function moveToSection(page: Page, worktreeId: string, sectionName: string): Promise<void> {
  await page.locator(`[data-worktree-id="${worktreeId}"]`).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to section' }).click()
  await page.getByRole('menuitem', { name: sectionName, exact: true }).click()
}

/** Card ids rendered in the named section, in screen order. */
function shownIn(page: Page, sectionName: string): Promise<string[]> {
  return page.evaluate((name) => {
    const section = window.__store
      ?.getState()
      .customSidebarSections?.sections.find((candidate) => candidate.name === name)
    const groupKey = section?.id === 'pinned' ? 'pinned' : `custom-section:${section?.id}`
    return [
      ...document.querySelectorAll(`[data-worktree-section-key="${groupKey}"][data-worktree-id]`)
    ].map((row) => row.getAttribute('data-worktree-id') ?? '')
  }, sectionName)
}

/** A rendered card, optionally only in groups whose key starts with `sectionKeyPrefix`. */
function card(page: Page, worktreeId: string, sectionKeyPrefix?: string): Locator {
  const section = sectionKeyPrefix
    ? `[data-worktree-section-key^="${sectionKeyPrefix}"]`
    : '[data-worktree-section-key]'
  return page.locator(`${section}[data-worktree-id="${worktreeId}"]`).first()
}

function sectionTitle(page: Page, name: string): Locator {
  return page.locator('[data-worktree-sticky-header]').filter({ hasText: name }).first()
}

/** Every sidebar card's position, to wait until a drop has finished moving the rows. */
function rowLayout(page: Page): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-worktree-sidebar] [data-worktree-row-key]')]
      .map(
        (row) => `${row.getAttribute('data-worktree-row-key')}@${row.getBoundingClientRect().top}`
      )
      .join(',')
  )
}

/** Bounds once every card stopped moving: a drop animates and re-measures the rows. */
async function settledBounds(
  locator: Locator
): Promise<{ x: number; y: number; width: number; height: number }> {
  let previous = ''
  await expect
    .poll(
      async () => {
        const current = await rowLayout(locator.page())
        const settled = current === previous
        previous = current
        return settled
      },
      { intervals: [150] }
    )
    .toBe(true)
  const box = await locator.boundingBox()
  if (!box) {
    throw new Error('Missing bounds')
  }
  return box
}

/** Pointer drag from the top of a card to a point; the caller drops with `page.mouse.up()`. */
async function dragTo(page: Page, source: Locator, x: number, y: number): Promise<void> {
  const from = await settledBounds(source)
  await page.mouse.move(from.x + from.width / 2, from.y + 12)
  await page.mouse.down()
  // Why: the drag starts after a short move and keeps that grab point for the floating card.
  await page.mouse.move(from.x + from.width / 2, from.y + 18, { steps: 2 })
  await page.mouse.move(x, y, { steps: 12 })
  await expect(page.locator('[data-worktree-sidebar-drag-preview]')).toHaveCount(1)
}

async function pin(page: Page, worktreeIds: string[]): Promise<void> {
  await page.evaluate((ids) => {
    const state = window.__store!.getState()
    state.setWorktreesPinnedAndReveal(
      state.allWorktrees().filter((worktree) => ids.includes(worktree.id)),
      true
    )
  }, worktreeIds)
}

test('cards drag into, between and out of user sections, and Pinned cards leave Pinned', async ({
  orcaPage
}, testInfo) => {
  // Seeds a repo with several workspaces and drives each drag with the real mouse in a hidden window.
  test.setTimeout(180_000)
  // Why: a hidden test window freezes the row-move animation after a cross-group drop, leaving cards mid-flight under the pointer.
  await orcaPage.emulateMedia({ reducedMotion: 'reduce' })
  await waitForSessionReady(orcaPage)
  const repo = await addRepoWithWorkspaces(orcaPage, testInfo, 4)
  const [w0, w1, w2, w3] = repo.ids
  await orcaPage.evaluate(() => {
    window.__store!.setState({
      groupBy: 'none',
      sortBy: 'manual',
      sidebarOpen: true,
      showActiveOnly: false,
      hideDefaultBranchWorkspace: false,
      filterRepoIds: []
    })
  })
  const sidebar = orcaPage.locator('[data-worktree-sidebar]')

  await createSection(orcaPage, 'MCF')
  await createSection(orcaPage, 'Infra')
  await moveToSection(orcaPage, w0!, 'MCF')
  await moveToSection(orcaPage, w2!, 'MCF')
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w0, w2])

  // From the regular list into the gap between two section cards.
  const lower = await settledBounds(card(orcaPage, w2!, 'custom-section:'))
  await dragTo(orcaPage, card(orcaPage, w1!), lower.x + 2, lower.y - 8)
  await sidebar.screenshot({ path: testInfo.outputPath('drag-into-section.png') })
  await orcaPage.mouse.up()
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w0, w1, w2])

  // Between sections, dropped on the title.
  const infraTitle = await settledBounds(sectionTitle(orcaPage, 'Infra'))
  await dragTo(
    orcaPage,
    card(orcaPage, w0!, 'custom-section:'),
    infraTitle.x + infraTitle.width / 2,
    infraTitle.y + infraTitle.height / 2
  )
  await orcaPage.mouse.up()
  await expect.poll(() => shownIn(orcaPage, 'Infra')).toEqual([w0])
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w1, w2])

  // From Pinned onto a section title: the card goes to the top and is unpinned, like the menu.
  await pin(orcaPage, [w3!])
  await expect(card(orcaPage, w3!, 'pinned')).toBeVisible()
  const mcfTitle = await settledBounds(sectionTitle(orcaPage, 'MCF'))
  await dragTo(
    orcaPage,
    card(orcaPage, w3!, 'pinned'),
    mcfTitle.x + 40,
    mcfTitle.y + mcfTitle.height / 2
  )
  await orcaPage.mouse.up()
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w3, w1, w2])
  await expect(sidebar.locator('[data-worktree-section-key="pinned"]')).toHaveCount(0)

  // Out of a user section onto the regular list: the card leaves the section.
  const mainCard = await settledBounds(card(orcaPage, repo.mainId))
  await dragTo(
    orcaPage,
    card(orcaPage, w1!, 'custom-section:'),
    mainCard.x + 2,
    mainCard.y + mainCard.height - 1
  )
  await orcaPage.mouse.up()
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w3, w2])
  await expect(card(orcaPage, w1!)).toBeVisible()

  // Into Pinned between two pinned cards: pinned at that position.
  await pin(orcaPage, [w1!, repo.mainId])
  await expect.poll(async () => (await shownIn(orcaPage, '')).length).toBe(2)
  const [firstPin, secondPin] = await shownIn(orcaPage, '')
  const lowerPin = await settledBounds(card(orcaPage, secondPin!, 'pinned'))
  await dragTo(orcaPage, card(orcaPage, w2!, 'custom-section:'), lowerPin.x + 2, lowerPin.y - 8)
  await orcaPage.mouse.up()
  await expect.poll(() => shownIn(orcaPage, '')).toEqual([firstPin, w2, secondPin])
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w3])

  // The drops reached the saved desktop state.
  await expect
    .poll(() =>
      orcaPage.evaluate(async () => {
        const stored = (await window.api.ui.get()).customSidebarSections
        return stored?.sections.map((section) => [section.name, section.members.length]) ?? []
      })
    )
    .toEqual([
      ['', 3],
      ['MCF', 1],
      ['Infra', 1]
    ])
  await sidebar.screenshot({ path: testInfo.outputPath('after-drags.png') })
})

test('grouped by status, section cards take drops and a card dropped back on the list leaves', async ({
  orcaPage
}, testInfo) => {
  // Seeds a repo with several workspaces and drives each drag with the real mouse in a hidden window.
  test.setTimeout(180_000)
  await orcaPage.emulateMedia({ reducedMotion: 'reduce' })
  await waitForSessionReady(orcaPage)
  const repo = await addRepoWithWorkspaces(orcaPage, testInfo, 3)
  const [w0, w1, w2] = repo.ids
  await writeWorkspaceMeta(orcaPage, [
    { worktreeId: w0!, updates: { workspaceStatus: 'in-progress' } },
    { worktreeId: w1!, updates: { workspaceStatus: 'in-progress' } },
    { worktreeId: w2!, updates: { workspaceStatus: 'in-review' } }
  ])
  await orcaPage.evaluate(() => {
    window.__store!.setState({
      groupBy: 'workspace-status',
      sortBy: 'recent',
      sidebarOpen: true,
      showActiveOnly: false,
      hideDefaultBranchWorkspace: false,
      filterRepoIds: []
    })
  })
  const statusOf = (id: string) =>
    orcaPage.evaluate(
      (target) => window.__store?.getState().getKnownWorktreeById(target)?.workspaceStatus,
      id
    )
  await createSection(orcaPage, 'MCF')
  await moveToSection(orcaPage, w0!, 'MCF')
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w0])

  // A card dropped on a section card joins the section; before, it took that card's status.
  const inSection = await settledBounds(card(orcaPage, w0!, 'custom-section:'))
  await dragTo(
    orcaPage,
    card(orcaPage, w2!, 'workspace-status:'),
    inSection.x + 2,
    inSection.y + inSection.height - 4
  )
  await orcaPage.mouse.up()
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w0, w2])
  expect(await statusOf(w2!)).toBe('in-review')
  // A status drop at a position switches the sort to Manual; a section drop leaves it alone.
  expect(await orcaPage.evaluate(() => window.__store?.getState().sortBy)).toBe('recent')

  // Dropped back on a card of another status, it leaves the section and takes that status.
  const inProgress = await settledBounds(card(orcaPage, w1!, 'workspace-status:'))
  await dragTo(
    orcaPage,
    card(orcaPage, w2!, 'custom-section:'),
    inProgress.x + 2,
    inProgress.y + inProgress.height - 1
  )
  await orcaPage.mouse.up()
  await expect.poll(() => shownIn(orcaPage, 'MCF')).toEqual([w0])
  await expect(card(orcaPage, w2!, 'workspace-status:in-progress')).toBeVisible()
  await orcaPage
    .locator('[data-worktree-sidebar]')
    .screenshot({ path: testInfo.outputPath('grouped-by-status.png') })
})
