import { defineFixture } from '../../../component-fixtures/component-fixture'
import type { CustomSidebarSectionsState } from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { SidebarHeaderActions } from '../sidebar-header-actions'
import { CustomSectionDialogHost } from './CustomSectionDialogHost'
import { CustomSectionHeaderMenu } from './CustomSectionHeaderMenu'

const sections: CustomSidebarSectionsState = {
  version: 1,
  sections: [
    { id: 'pinned', name: '', members: [] },
    { id: 'mcf', name: 'MCF', members: [] }
  ]
}

function ProjectsHeader({ agentsViewActive }: { agentsViewActive: boolean }) {
  return (
    <div className="flex h-8 items-center justify-between gap-1.5 px-2">
      <span className="text-xs font-semibold text-muted-foreground">Projects</span>
      <SidebarHeaderActions
        onWorkspaceBoardMenuOpenChange={() => {}}
        agentsViewActive={agentsViewActive}
      />
    </div>
  )
}

function openMenu(frame: HTMLElement): void {
  const trigger = frame.querySelector<HTMLButtonElement>('button[aria-label^="Section actions"]')
  trigger?.dispatchEvent(
    new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })
  )
}

export const header = defineFixture({
  width: 280,
  store: { customSidebarSections: sections, persistedUIReady: true },
  render: () => <ProjectsHeader agentsViewActive={false} />
})

// Activity view hides the button but keeps its slot, so no header control moves.
export const headerInActivityView = defineFixture({
  width: 280,
  store: { customSidebarSections: sections, persistedUIReady: true },
  render: () => <ProjectsHeader agentsViewActive />
})

export const newSectionDialog = defineFixture({
  width: 420,
  store: {
    customSidebarSections: sections,
    customSectionDialog: { mode: 'create' },
    persistedUIReady: true
  },
  render: () => <CustomSectionDialogHost />
})

export const deleteSectionDialog = defineFixture({
  width: 420,
  store: {
    customSidebarSections: sections,
    customSectionDialog: { mode: 'delete', sectionId: 'mcf', name: 'MCF' },
    persistedUIReady: true
  },
  render: () => <CustomSectionDialogHost />
})

export const sectionMenu = defineFixture({
  width: 280,
  store: { customSidebarSections: sections, persistedUIReady: true },
  render: () => (
    <div className="flex h-56 justify-end">
      <CustomSectionHeaderMenu headerKey="custom-section:mcf" label="MCF" />
    </div>
  ),
  interact: openMenu
})

// Before first use nothing is stored, yet Pinned already offers its menu.
export const pinnedSectionMenuBeforeFirstUse = defineFixture({
  width: 280,
  store: { customSidebarSections: null, persistedUIReady: true },
  render: () => (
    <div className="flex h-56 justify-end">
      <CustomSectionHeaderMenu headerKey="pinned" label="Pinned" />
    </div>
  ),
  interact: openMenu
})

export const pinnedSectionMenu = defineFixture({
  width: 280,
  store: { customSidebarSections: sections, persistedUIReady: true },
  render: () => (
    <div className="flex h-56 justify-end">
      <CustomSectionHeaderMenu headerKey="pinned" label="Pinned" />
    </div>
  ),
  interact: openMenu
})
