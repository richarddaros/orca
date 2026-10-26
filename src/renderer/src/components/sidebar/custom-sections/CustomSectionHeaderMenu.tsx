import React from 'react'
import { Ellipsis } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { isPairedWebClientWindow } from '@/lib/desktop-window-chrome'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  PINNED_CUSTOM_SECTION_ID,
  getCustomSectionIdFromGroupKey
} from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import { PINNED_GROUP_KEY } from '../../../../../shared/sidebar-list/group-keys'
import {
  handleRepoHeaderActionPointerDown,
  stopRepoHeaderKeyboardToggle,
  stopRepoHeaderMenuEvent
} from '../worktree-list/rows/header-event-guards'
import { getCustomSectionDisplayName } from './custom-section-display-name'
import { useShownCustomSidebarSections } from './use-shown-custom-sidebar-sections'

export function isCustomSectionHeaderKey(key: string): boolean {
  return getCustomSectionIdFromGroupKey(key) !== null
}

function SectionActionsMenu({
  sectionId,
  label
}: {
  sectionId: string
  label: string
}): React.JSX.Element | null {
  const sections = useShownCustomSidebarSections()
  const moveSection = useAppStore((s) => s.moveCustomSection)
  const setDialog = useAppStore((s) => s.setCustomSectionDialog)
  const index = sections?.sections.findIndex((section) => section.id === sectionId) ?? -1
  const section = sections?.sections[index]
  if (!sections || !section) {
    return null
  }
  const isPinned = sectionId === PINNED_CUSTOM_SECTION_ID

  return (
    <DropdownMenu modal={false}>
      {/* Same hover reveal as the project-group menu, on a wrapper so the Button keeps its own styling. */}
      <span className="-ml-1.5 flex min-w-0 max-w-0 overflow-hidden text-muted-foreground opacity-0 transition-[margin,max-width,opacity] focus-within:ml-0 focus-within:max-w-6 focus-within:opacity-100 group-hover:ml-0 group-hover:max-w-6 group-hover:opacity-100 has-[[data-state=open]]:ml-0 has-[[data-state=open]]:max-w-6 has-[[data-state=open]]:opacity-100 [@media(hover:none)]:ml-0 [@media(hover:none)]:max-w-6 [@media(hover:none)]:opacity-100">
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            data-repo-header-action=""
            aria-label={translate('customSections.actionsFor', 'Section actions for {{name}}', {
              name: label
            })}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={stopRepoHeaderKeyboardToggle}
            onPointerDown={handleRepoHeaderActionPointerDown}
          >
            <Ellipsis className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={6}
        // Why: the portal still bubbles through the header; keep menu events from toggling or dragging it.
        onPointerDown={stopRepoHeaderMenuEvent}
        onMouseDown={stopRepoHeaderMenuEvent}
        onPointerUp={stopRepoHeaderMenuEvent}
        onMouseUp={stopRepoHeaderMenuEvent}
        onClick={stopRepoHeaderMenuEvent}
        onKeyDown={stopRepoHeaderMenuEvent}
      >
        <DropdownMenuItem
          onSelect={() =>
            setDialog({
              mode: 'rename',
              sectionId,
              currentName: getCustomSectionDisplayName(section)
            })
          }
        >
          {translate('customSections.renameTitle', 'Rename section')}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={index === 0} onSelect={() => void moveSection(sectionId, -1)}>
          {translate('customSections.moveUp', 'Move section up')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={index === sections.sections.length - 1}
          onSelect={() => void moveSection(sectionId, 1)}
        >
          {translate('customSections.moveDown', 'Move section down')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={isPinned}
          onSelect={() => setDialog({ mode: 'delete', sectionId, name: section.name })}
        >
          {translate('customSections.delete', 'Delete section')}
        </DropdownMenuItem>
        {isPinned ? (
          <p className="max-w-56 px-2 py-1 text-2xs text-muted-foreground">
            {translate('customSections.pinnedStays', 'Pinned stays: Pin and Unpin use it.')}
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Fork (richarddaros/orca): ⋯ menu for Pinned and user sections; nothing for other headers or on web. */
export function CustomSectionHeaderMenu({
  headerKey,
  label
}: {
  headerKey: string
  label: string
}): React.JSX.Element | null {
  const sectionId =
    headerKey === PINNED_GROUP_KEY
      ? PINNED_CUSTOM_SECTION_ID
      : getCustomSectionIdFromGroupKey(headerKey)
  if (!sectionId || isPairedWebClientWindow()) {
    return null
  }
  return <SectionActionsMenu sectionId={sectionId} label={label} />
}
