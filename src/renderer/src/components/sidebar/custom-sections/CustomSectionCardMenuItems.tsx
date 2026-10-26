import React, { useMemo } from 'react'
import { ArrowDown, ArrowUp, ListMinus, ListPlus } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  PINNED_CUSTOM_SECTION_ID,
  getAdjacentShownMemberIndex,
  type CustomSidebarSectionsState
} from '../../../../../shared/custom-sidebar-sections/custom-sidebar-sections-state'
import {
  composeWorktreeHostIdentity,
  getWorktreeHostIdentity
} from '../../../../../shared/worktree/host-qualified-identity'
import type { Worktree } from '../../../../../shared/worktree/types'
import { getVisibleWorktreeShortcutTargets } from '../visible-worktrees'
import { getCustomSectionDisplayName } from './custom-section-display-name'
import { useShownCustomSidebarSections } from './use-shown-custom-sidebar-sections'

type CardMenuItemsProps = { worktree: Worktree; disabled: boolean }

/** Fork (richarddaros/orca): section items for a workspace card's menu, after Pin/Unpin. */
export function CustomSectionCardMenuItems(props: CardMenuItemsProps): React.JSX.Element | null {
  const sections = useShownCustomSidebarSections()
  return sections ? <SectionItems {...props} sections={sections} /> : null
}

function SectionItems({
  worktree,
  disabled,
  sections
}: CardMenuItemsProps & { sections: CustomSidebarSectionsState }): React.JSX.Element {
  const moveToSection = useAppStore((s) => s.moveWorkspaceToCustomSection)
  const removeFromSection = useAppStore((s) => s.removeWorkspaceFromCustomSection)
  const setDialog = useAppStore((s) => s.setCustomSectionDialog)
  // Why: Move up/down skips members hidden by archive, filters or host scope, so one click always moves the card.
  const shownKeys = useMemo(
    () =>
      new Set<string>(
        getVisibleWorktreeShortcutTargets().map((target) =>
          composeWorktreeHostIdentity(target.executionHostId, target.id)
        )
      ),
    []
  )
  const key = getWorktreeHostIdentity(worktree)
  const workspace = { key, worktree }
  const current = worktree.isPinned
    ? sections.sections.find((section) => section.id === PINNED_CUSTOM_SECTION_ID)
    : sections.sections.find((section) => section.members.includes(key))
  const neighbour = (direction: -1 | 1): number | null =>
    current
      ? getAdjacentShownMemberIndex(current.members, key, direction, (member) =>
          shownKeys.has(member)
        )
      : null
  const above = neighbour(-1)
  const below = neighbour(1)

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled}>
          <ListPlus className="size-3.5" />
          {translate('customSections.moveToSection', 'Move to section')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {sections.sections.map((section) => (
            <DropdownMenuItem
              key={section.id}
              disabled={section.id === current?.id}
              onSelect={() => void moveToSection(workspace, section.id)}
            >
              <span className="max-w-48 truncate">{getCustomSectionDisplayName(section)}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog({ mode: 'create', firstMember: workspace })}>
            {translate('customSections.newSectionWithWorkspace', 'New section with this workspace')}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {current ? (
        <>
          <DropdownMenuItem
            disabled={disabled || above === null}
            onSelect={() => above !== null && void moveToSection(workspace, current.id, above)}
          >
            <ArrowUp className="size-3.5" />
            {translate('customSections.moveWorkspaceUp', 'Move up in section')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={disabled || below === null}
            onSelect={() => below !== null && void moveToSection(workspace, current.id, below)}
          >
            <ArrowDown className="size-3.5" />
            {translate('customSections.moveWorkspaceDown', 'Move down in section')}
          </DropdownMenuItem>
          {current.id === PINNED_CUSTOM_SECTION_ID ? null : (
            <DropdownMenuItem disabled={disabled} onSelect={() => removeFromSection(workspace)}>
              <ListMinus className="size-3.5" />
              {translate('customSections.removeFromSection', 'Remove from section')}
            </DropdownMenuItem>
          )}
        </>
      ) : null}
      <DropdownMenuSeparator />
    </>
  )
}
