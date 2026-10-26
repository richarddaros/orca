import { existsSync, readFileSync } from 'node:fs'
import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { getAllWorktreeIds, waitForSessionReady } from './helpers/store'
import { TEST_REPO_PATH_FILE } from './global-setup'

// Fork (richarddaros/orca): user sidebar sections, issue #10.
function renderedIds(page: Page, selector: string): Promise<(string | null)[]> {
  return page.$$eval(selector, (rows) => rows.map((row) => row.getAttribute('data-worktree-id')))
}

async function listOrder(page: Page, ids: readonly string[]): Promise<string[]> {
  const rendered = await renderedIds(page, '[data-worktree-section-key][data-worktree-id]')
  return rendered.filter((id): id is string => id !== null && ids.includes(id))
}

const sectionOrder = (page: Page) =>
  renderedIds(page, '[data-worktree-section-key^="custom-section:"][data-worktree-id]')

const activityOf = (page: Page, id: string) =>
  page.evaluate((target) => {
    return window.__store?.getState().getKnownWorktreeById(target)?.lastActivityAt ?? 0
  }, id)

/** The active workspace's terminal stamps activity right after launch; wait until it stops. */
async function waitForQuietActivity(page: Page, ids: readonly string[]): Promise<void> {
  let previous = ''
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await Promise.all(ids.map((id) => activityOf(page, id))))
        const quiet = current === previous
        previous = current
        return quiet
      },
      { intervals: [1_000], timeout: 15_000 }
    )
    .toBe(true)
}

/** Bumps a background workspace (the active one never re-sorts) and waits for the sort to settle. */
async function bumpActivity(page: Page, worktreeId: string): Promise<void> {
  const before = await activityOf(page, worktreeId)
  await page.evaluate((id) => window.__store?.getState().bumpWorktreeActivity(id), worktreeId)
  await expect.poll(() => activityOf(page, worktreeId)).toBeGreaterThan(before)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const state = window.__store?.getState()
          return state ? state.settledSortEpoch === state.sortEpoch : false
        }),
      { timeout: 15_000 }
    )
    .toBe(true)
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)))
}

async function moveToSection(page: Page, worktreeId: string, sectionName: string): Promise<void> {
  await page.locator(`[data-worktree-id="${worktreeId}"]`).first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to section' }).click()
  await page.getByRole('menuitem', { name: sectionName, exact: true }).click()
}

async function createSection(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'New section' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox').fill(name)
  await dialog.getByRole('button', { name: 'Create' }).click()
}

test('a user section keeps the order the user chose while Recent re-sorts on activity', async ({
  orcaPage
}, testInfo) => {
  await waitForSessionReady(orcaPage)
  const [first, second] = await getAllWorktreeIds(orcaPage)
  expect(second).toBeTruthy()
  // Why ungrouped: repo grouping always lists the main worktree first, whatever its activity.
  await orcaPage.evaluate(() => {
    window.__store?.getState().setGroupBy('none')
    window.__store?.getState().setSortBy('recent')
  })

  await waitForQuietActivity(orcaPage, [first, second])
  const [top, bottom] = await listOrder(orcaPage, [first, second])
  // Why: bumping the active workspace never re-sorts, so the one moved by activity must be in the background.
  await orcaPage.evaluate((id) => window.__store?.getState().setActiveWorktree(id), top)
  await waitForQuietActivity(orcaPage, [first, second])
  expect(await listOrder(orcaPage, [first, second])).toEqual([top, bottom])

  // Control: outside sections, activity moves the background workspace to the top.
  await bumpActivity(orcaPage, bottom)
  await expect
    .poll(() => listOrder(orcaPage, [first, second]), { timeout: 15_000 })
    .toEqual([bottom, top])

  await createSection(orcaPage, 'MCF')
  const sidebar = orcaPage.locator('[data-worktree-sidebar]')
  await expect(sidebar.getByText('MCF', { exact: true })).toBeVisible()

  await moveToSection(orcaPage, top, 'MCF')
  await moveToSection(orcaPage, bottom, 'MCF')
  await expect.poll(() => sectionOrder(orcaPage)).toEqual([top, bottom])

  // Recent would put the bumped workspace first again; the section keeps the order the user chose.
  await bumpActivity(orcaPage, bottom)
  expect(await sectionOrder(orcaPage)).toEqual([top, bottom])
  expect(await orcaPage.evaluate(() => window.__store?.getState().sortBy)).toBe('recent')

  await sidebar.screenshot({ path: testInfo.outputPath('custom-sidebar-sections.png') })
})

test('a user section and its workspace come back after quit and relaunch', async (// oxlint-disable-next-line no-empty-pattern -- this test owns both Electron launches.
{}, testInfo) => {
  // Why: two full app launches plus a repo attach outlast the default test timeout.
  test.setTimeout(300_000)
  const repoPath = existsSync(TEST_REPO_PATH_FILE)
    ? readFileSync(TEST_REPO_PATH_FILE, 'utf8').trim()
    : ''
  expect(repoPath && existsSync(repoPath)).toBeTruthy()
  const session = createRestartSession(testInfo)
  let app: ElectronApplication | null = null
  try {
    const first = await session.launch()
    app = first.app
    await waitForSessionReady(first.page)
    const worktreeId = await attachRepoAndOpenTerminal(first.page, repoPath)
    await createSection(first.page, 'MCF')
    await moveToSection(first.page, worktreeId, 'MCF')
    await expect.poll(() => sectionOrder(first.page)).toEqual([worktreeId])
    // Why: the section write is fire-and-forget; quit only after main has the member too.
    await expect
      .poll(() =>
        first.page.evaluate(async (id) => {
          const stored = (await window.api.ui.get()).customSidebarSections
          return (
            stored?.sections.some(
              (section) =>
                section.name === 'MCF' && section.members.some((key) => key.endsWith(`|${id}`))
            ) ?? false
          )
        }, worktreeId)
      )
      .toBe(true)
    await session.close(first.app)
    app = null

    const second = await session.launch()
    app = second.app
    await waitForSessionReady(second.page)
    await expect(
      second.page.locator('[data-worktree-sidebar]').getByText('MCF', { exact: true })
    ).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => sectionOrder(second.page), { timeout: 30_000 }).toEqual([worktreeId])
  } finally {
    await session.dispose(app ?? undefined)
  }
})
